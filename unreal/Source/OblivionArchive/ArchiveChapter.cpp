#include "ArchiveChapter.h"
#include "ArchiveCitadel.h"
#include "ArchiveConstruction.h"
#include "ArchiveData.h"
#include "ArchivePlayer.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/PrimitiveComponent.h"
#include "Engine/Texture2D.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "ImageUtils.h"
#include "Internationalization/Culture.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/CommandLine.h"
#include "Materials/MaterialInstanceDynamic.h"

AArchiveChapter::AArchiveChapter()
{
    PrimaryActorTick.bCanEverTick = true;
    SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("Layout")));
}

bool AArchiveChapter::Build()
{
    auto ReadText = [](const FString& Name, TMap<FString, FString>& Out) {
        auto Json = ArchiveData::Read(Name);
        if (!Json)
            return false;
        for (auto& Entry : Json->Values)
            Out.Add(FString(Entry.Key.ToView()), Entry.Value->AsString());
        return true;
    };
    if (!ReadText(TEXT("story-en.json"), English) || !ReadText(TEXT("menu-en.json"), English))
        return false;
    FString Language = FInternationalization::Get().GetCurrentCulture()->GetTwoLetterISOLanguageName();
#if PLATFORM_WASM && !UE_ENABLE_ICU
    // Preview 2 forwards the browser language to the game thread. Its default web Core only has the
    // invariant culture, but the chapter's two plain-text catalogs do not require ICU.
    FString BrowserLocale;
    if (FParse::Value(FCommandLine::Get(), TEXT("-culture="), BrowserLocale) ||
        FParse::Value(FCommandLine::Get(), TEXT("-WebBrowserLang="), BrowserLocale))
    {
        Language = BrowserLocale.ToLower().Replace(TEXT("_"), TEXT("-"));
        int32 Region;
        if (Language.FindChar('-', Region))
            Language.LeftInline(Region);
    }
#endif
    if (Language == TEXT("ko"))
    {
        if (!ReadText(TEXT("story-ko.json"), Local) || !ReadText(TEXT("menu-ko.json"), Local))
            return false;
    }
    auto Picture = [](const TCHAR* File) {
        TArray<uint8> Bytes;
        if (!FFileHelper::LoadFileToArray(Bytes, *ArchiveData::File(File)))
            return (UTexture2D*)nullptr;
        return FImageUtils::ImportBufferAsTexture2D(Bytes);
    };
    Faded = Picture(TEXT("erased.jpg"));
    Restored = Picture(TEXT("restored.jpg"));
    if (!Faded || !Restored || !FArchiveConstruction(*this).Build())
        return false;
    Slot = FParse::Param(FCommandLine::Get(), TEXT("ArchiveVerify")) ? TEXT("Archive.Automation.Chapter")
                                                                     : TEXT("Archive.ChapterOne.v1");
    auto* Existing = UGameplayStatics::DoesSaveGameExist(Slot, 0)
                         ? Cast<UArchiveCheckpoint>(UGameplayStatics::LoadGameFromSlot(Slot, 0))
                         : nullptr;
    Saved = ValidSave(Existing) ? Existing : nullptr;
    Refresh(true);
    return true;
}

bool AArchiveChapter::ValidSave(const UArchiveCheckpoint* Record) const
{
    if (!Record || Record->Version != 1 || Record->Phase < 1 || Record->Phase > 5 || Record->Runes.Num() != 3)
        return false;
    for (int32 Rune : Record->Runes)
        if (Rune < 0 || Rune > 2)
            return false;
    return true;
}

FString AArchiveChapter::Text(const FString& Key) const
{
    if (auto* Value = Local.Find(Key))
        return *Value;
    if (auto* Value = English.Find(Key))
        return *Value;
    return Key;
}

void AArchiveChapter::NewChapter(AArchiveCharacter& Player)
{
    if (UGameplayStatics::DoesSaveGameExist(Slot, 0))
        UGameplayStatics::DeleteGameInSlot(Slot, 0);
    Saved = nullptr;
    Retry(Player);
}

void AArchiveChapter::Continue(AArchiveCharacter& Player)
{
    Retry(Player);
    if (Phase == 5)
        Screen = EArchiveScreen::Ending;
}

void AArchiveChapter::Retry(AArchiveCharacter& Player)
{
    Screen = EArchiveScreen::Play;
    Phase = Saved ? Saved->Phase : 0;
    Runes = Saved ? Saved->Runes : TArray<int32>{2, 2, 2};
    bClue = Saved && Saved->Clue;
    Subtitle.Reset();
    Lines.Reset();
    Refresh(true);
    ResetPlayer(Player);
}

void AArchiveChapter::ResetPlayer(AArchiveCharacter& Player)
{
    const FVector Spawn = Phase == 0   ? FVector(.5, 0, -1.95)
                          : Phase == 5 ? FVector(0, 0, -4.5)
                          : Phase == 4 ? FVector(15.4, 0, 5.45)
                          : Phase >= 2 ? FVector(12.9, 0, 10.3)
                                       : FVector(1.7, 0, 10.3);
    Player.GetCharacterMovement()->StopMovementImmediately();
    Player.GetCharacterMovement()->SetMovementMode(MOVE_Walking);
    Player.SetActorLocationAndRotation(
        FArchiveConstruction::Cm(Spawn) +
            FVector(0, 0, Player.GetCapsuleComponent()->GetScaledCapsuleHalfHeight() + 2),
        FRotator::ZeroRotator, false, nullptr, ETeleportType::TeleportPhysics);
    if (Player.GetController())
        Player.GetController()->SetControlRotation(FRotator::ZeroRotator);
}

void AArchiveChapter::SaveProgress()
{
    Saved = CastChecked<UArchiveCheckpoint>(
        UGameplayStatics::CreateSaveGameObject(UArchiveCheckpoint::StaticClass()));
    Saved->Phase = Phase;
    Saved->Runes = Runes;
    Saved->Clue = bClue;
    if (!UGameplayStatics::SaveGameToSlot(Saved, Slot, 0))
        UE_LOG(LogTemp, Warning,
               TEXT("Checkpoints available in memory for this session; could not write save."));
}

void AArchiveChapter::Refresh(bool Immediate)
{
    if (Castle)
        Castle->ApplyStoryPhase(Phase);
    if (PhotoMaterial)
        PhotoMaterial->SetTextureParameterValue(TEXT("Texture"), Phase == 5 ? Restored : Faded);
    for (int32 I = 0; I < Glyphs.Num(); ++I)
        for (int32 G = 0; G < Glyphs[I].Num(); ++G)
            if (auto* Glyph = Glyphs[I][G].Get())
                Glyph->SetVisibility(Runes[I] == G, true);
    if (Immediate)
        for (int32 I = 0; I < Doors.Num(); ++I)
            Doors[I]->SetRelativeLocation(DoorOrigins[I] + FVector::UpVector * (Phase >= (I == 0   ? 1
                                                                                          : I == 1 ? 2
                                                                                                   : 4)
                                                                                    ? 350
                                                                                    : 0));
}

void AArchiveChapter::SetCastle(AArchiveCitadel* InCastle)
{
    Castle = InCastle;
    if (Castle)
        Castle->ApplyStoryPhase(Phase);
}

void AArchiveChapter::AdvanceMenu(AArchiveCharacter& Player)
{
    switch (Screen)
    {
    case EArchiveScreen::Title:
        if (Saved)
            Continue(Player);
        else
            NewChapter(Player);
        break;
    case EArchiveScreen::Defeated:
        Retry(Player);
        break;
    case EArchiveScreen::Paused:
        Screen = EArchiveScreen::Play;
        break;
    case EArchiveScreen::Ending:
        Screen = EArchiveScreen::Title;
        break;
    default:
        break;
    }
}
void AArchiveChapter::Pause()
{
    if (Screen == EArchiveScreen::Play)
        Screen = EArchiveScreen::Paused;
    else if (Screen == EArchiveScreen::Paused)
        Screen = EArchiveScreen::Play;
}
void AArchiveChapter::Fall()
{
    if (Screen == EArchiveScreen::Play)
        Screen = EArchiveScreen::Defeated;
}

FString AArchiveChapter::Objective() const
{
    const TCHAR* Names[] = {TEXT("photo"),  TEXT("corridor"),    TEXT("vault"),
                            TEXT("return"), TEXT("restoration"), TEXT("complete")};
    return Text(FString(TEXT("story.objective.")) + Names[Phase] + TEXT(".text"));
}

bool AArchiveChapter::Allowed(const FString& Id) const
{
    if (Screen != EArchiveScreen::Play)
        return false;
    if (Id == TEXT("photo"))
        return Phase == 0 || Phase == 4;
    if (Id == TEXT("mural") || Id.StartsWith(TEXT("rune")) || Id == TEXT("seal"))
        return Phase == 1;
    return (Id == TEXT("ledger") && Phase == 2) || (Id == TEXT("shortcut") && Phase == 3);
}

FString AArchiveChapter::AimId(const AArchiveCharacter& Player) const
{
    FVector Eye = Player.Eyes()->GetComponentLocation();
    FHitResult Hit;
    if (!GetWorld()->LineTraceSingleByChannel(
            Hit, Eye, Eye + Player.Eyes()->GetForwardVector() * 280, ECC_Visibility,
            FCollisionQueryParams(SCENE_QUERY_STAT(ArchiveUse), false, &Player)))
        return {};
    auto* Target = Targets.Find(Hit.GetComponent());
    if (!Target || !Allowed(*Target))
        return {};
    FVector At = Player.GetActorLocation();
    At.Z -= Player.GetCapsuleComponent()->GetScaledCapsuleHalfHeight();
    const FVector& Approach = Approaches.FindChecked(*Target);
    return FVector::Dist2D(At, Approach) <= Ranges.FindChecked(*Target) && FMath::Abs(At.Z - Approach.Z) < 165
               ? *Target
               : FString();
}

FString AArchiveChapter::Prompt(const FString& Id) const
{
    if (Id.IsEmpty())
        return {};
    if (Id.StartsWith(TEXT("rune")))
    {
        int32 I = Id[4] - '0';
        static const TCHAR* Pos[] = {TEXT("left"), TEXT("middle"), TEXT("right")};
        static const TCHAR* Signs[] = {TEXT("lantern"), TEXT("quill"), TEXT("wave")};
        return Text(TEXT("story.action.rune"))
                   .Replace(TEXT("{position}"), *Text(FString(TEXT("story.rune.")) + Pos[I])) +
               TEXT("  ·  ") + Text(FString(TEXT("story.rune.")) + Signs[Runes[I]]);
    }
    return Text(
        TEXT("story.action.") +
        (Id == TEXT("photo") ? (Phase == 4 ? FString(TEXT("restore")) : FString(TEXT("inspect"))) : Id));
}

void AArchiveChapter::Say(const FString& Value)
{
    Lines.Reset();
    Value.ParseIntoArrayLines(Lines);
    Subtitle = Lines.IsEmpty() ? FString() : Lines[0];
    if (!Lines.IsEmpty())
        Lines.RemoveAt(0);
    LineTime = 4.8f;
}

bool AArchiveChapter::Interact(AArchiveCharacter& Player)
{
    FString Id = AimId(Player);
    if (Id.IsEmpty())
        return false;
    if (Id == TEXT("mural"))
    {
        bClue = true;
        if (Saved)
        {
            Saved->Clue = true;
            UGameplayStatics::SaveGameToSlot(Saved, Slot, 0);
        }
        Say(Text(TEXT("story.event.mural-read")));
        return true;
    }
    if (Id.StartsWith(TEXT("rune")))
    {
        int32 I = Id[4] - '0';
        Runes[I] = (Runes[I] + 1) % 3;
        Refresh(false);
        Say(Prompt(Id));
        return true;
    }
    if (Id == TEXT("seal") && !(Runes[0] == 0 && Runes[1] == 1 && Runes[2] == 2))
    {
        Say(Text(TEXT("story.event.seal-closed")));
        return true;
    }
    const TCHAR* Events[] = {TEXT("photo-found"), TEXT("seal-opened"), TEXT("ledger-read"),
                             TEXT("shortcut-opened"), TEXT("name-restored")};
    Say(Text(FString(TEXT("story.event.")) + Events[Phase]));
    ++Phase;
    SaveProgress();
    Refresh(false);
    if (Phase == 5)
        Screen = EArchiveScreen::Ending;
    return true;
}

UPrimitiveComponent* AArchiveChapter::FindPart(FName Id) const
{
    const auto* Found = Parts.Find(Id);
    return Found ? Found->Get() : nullptr;
}

void AArchiveChapter::Tick(float Dt)
{
    Super::Tick(Dt);
    if (Screen != EArchiveScreen::Play)
        return;
    for (int32 I = 0; I < Doors.Num(); ++I)
    {
        const FVector Goal = DoorOrigins[I] + FVector::UpVector * (Phase >= (I == 0   ? 1
                                                                             : I == 1 ? 2
                                                                                      : 4)
                                                                       ? 350
                                                                       : 0);
        Doors[I]->SetRelativeLocation(
            FMath::VInterpConstantTo(Doors[I]->GetRelativeLocation(), Goal, Dt, 275));
    }
    if ((LineTime -= Dt) <= 0)
    {
        Subtitle = Lines.IsEmpty() ? FString() : Lines[0];
        if (!Lines.IsEmpty())
            Lines.RemoveAt(0);
        LineTime = 4.8f;
    }
}
