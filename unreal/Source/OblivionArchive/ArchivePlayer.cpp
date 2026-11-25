#include "ArchivePlayer.h"
#include "ArchiveChapter.h"
#include "ArchiveCitadel.h"
#include "ArchiveData.h"
#include "ArchiveVerification.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/InputComponent.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Texture2D.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "GameFramework/PlayerController.h"
#include "Misc/CommandLine.h"
#include "TimerManager.h"

AArchiveCharacter::AArchiveCharacter()
{
    GetCapsuleComponent()->InitCapsuleSize(25, 84);
    Camera = CreateDefaultSubobject<UCameraComponent>(TEXT("Eyes"));
    Camera->SetupAttachment(GetCapsuleComponent());
    Camera->SetRelativeLocation(FVector(0, 0, 72));
    Camera->bUsePawnControlRotation = true;
    bUseControllerRotationYaw = true;
    auto* Movement = GetCharacterMovement();
    Movement->MaxWalkSpeed = 300;
    Movement->JumpZVelocity = 500;
    Movement->GravityScale = 1.84;
    Movement->MaxStepHeight = 32;
    Movement->BrakingDecelerationWalking = 1800;
    PrimaryActorTick.bCanEverTick = true;
}

AArchiveChapter* AArchiveCharacter::Chapter() const
{
    auto* Mode = GetWorld() ? GetWorld()->GetAuthGameMode<AArchiveGameMode>() : nullptr;
    return Mode ? Mode->Chapter.Get() : nullptr;
}
void AArchiveCharacter::SetupPlayerInputComponent(UInputComponent* I)
{
    Super::SetupPlayerInputComponent(I);
    I->BindAxis(TEXT("Forward"), this, &AArchiveCharacter::Forward);
    I->BindAxis(TEXT("Right"), this, &AArchiveCharacter::Right);
    I->BindAxis(TEXT("Yaw"), this, &AArchiveCharacter::Yaw);
    I->BindAxis(TEXT("Pitch"), this, &AArchiveCharacter::Pitch);
    I->BindAction(TEXT("Jump"), IE_Pressed, this, &AArchiveCharacter::StartJump);
    I->BindAction(TEXT("Jump"), IE_Released, this, &ACharacter::StopJumping);
    I->BindAction(TEXT("Run"), IE_Pressed, this, &AArchiveCharacter::Sprint);
    I->BindAction(TEXT("Run"), IE_Released, this, &AArchiveCharacter::Walk);
    I->BindAction(TEXT("Interact"), IE_Pressed, this, &AArchiveCharacter::Interact);
    I->BindAction(TEXT("Begin"), IE_Pressed, this, &AArchiveCharacter::Confirm);
    I->BindAction(TEXT("NewChapter"), IE_Pressed, this, &AArchiveCharacter::NewChapter);
    I->BindAction(TEXT("Pause"), IE_Pressed, this, &AArchiveCharacter::Pause);
}
static bool CanPlay(const AArchiveCharacter& P)
{
    auto* C = P.Chapter();
    return C && C->Screen == EArchiveScreen::Play;
}
void AArchiveCharacter::Forward(float V)
{
    if (CanPlay(*this))
        AddMovementInput(GetActorForwardVector(), V);
}
void AArchiveCharacter::Right(float V)
{
    if (CanPlay(*this))
        AddMovementInput(GetActorRightVector(), V);
}
void AArchiveCharacter::Yaw(float V)
{
    if (CanPlay(*this))
        AddControllerYawInput(V);
}
void AArchiveCharacter::Pitch(float V)
{
    if (CanPlay(*this))
        AddControllerPitchInput(V);
}
void AArchiveCharacter::StartJump()
{
    if (CanPlay(*this))
        Jump();
}
void AArchiveCharacter::Sprint()
{
    if (CanPlay(*this))
        GetCharacterMovement()->MaxWalkSpeed = 520;
}
void AArchiveCharacter::Walk()
{
    GetCharacterMovement()->MaxWalkSpeed = 300;
}
void AArchiveCharacter::Interact()
{
    if (auto* C = Chapter())
        C->Interact(*this);
}
void AArchiveCharacter::Confirm()
{
    if (auto* C = Chapter())
        C->AdvanceMenu(*this);
}
void AArchiveCharacter::NewChapter()
{
    if (auto* C = Chapter(); C && C->Screen == EArchiveScreen::Title)
        C->NewChapter(*this);
}
void AArchiveCharacter::Pause()
{
    if (auto* C = Chapter())
        C->Pause();
}
void AArchiveCharacter::Tick(float Dt)
{
    Super::Tick(Dt);
    if (GetActorLocation().Z < -1400 && CanPlay(*this))
    {
        Chapter()->Fall();
        GetCharacterMovement()->DisableMovement();
    }
}

AArchiveGameMode::AArchiveGameMode()
{
    DefaultPawnClass = AArchiveCharacter::StaticClass();
    HUDClass = AArchiveHUD::StaticClass();
}
void AArchiveGameMode::HandleStartingNewPlayer_Implementation(APlayerController* PC)
{
    RestartPlayerAtTransform(PC, FTransform(FRotator::ZeroRotator, FVector(-195, 50, 86)));
}
void AArchiveGameMode::StartPlay()
{
    Chapter = GetWorld()->SpawnActor<AArchiveChapter>();
    if (!Chapter || !Chapter->Build())
    {
        UE_LOG(LogTemp, Error,
               TEXT("ARCHIVE native chapter failed to load; check the staged ArchiveData directory."));
        if (FParse::Param(FCommandLine::Get(), TEXT("ArchiveVerify")))
            FPlatformMisc::RequestExitWithStatus(false, 1);
        Super::StartPlay();
        return;
    }
    auto* Castle = GetWorld()->SpawnActor<AArchiveCitadel>();
    if (!Castle || !Castle->LoadBake(ArchiveData::File(TEXT("citadel.json.gz"))))
    {
        UE_LOG(LogTemp, Error, TEXT("ARCHIVE could not build the authored exterior."));
        if (FParse::Param(FCommandLine::Get(), TEXT("ArchiveVerify")))
            FPlatformMisc::RequestExitWithStatus(false, 1);
    }
    else
        Chapter->SetCastle(Castle);
    Super::StartPlay();
    UE_LOG(LogTemp, Display,
           TEXT("ARCHIVE ready: Reading Room / Ruined Corridor / Sealed Vault / Star Crossing."));
#if !UE_BUILD_SHIPPING
    if (FParse::Param(FCommandLine::Get(), TEXT("ArchiveVerify")))
    {
        FTimerHandle Startup;
        GetWorldTimerManager().SetTimer(Startup, [this] { ArchiveVerify(*this); }, 1.0f, false);
    }
#endif
}

void AArchiveHUD::DrawHUD()
{
    Super::DrawHUD();
    if (!Canvas || !PlayerOwner)
        return;
    auto* Player = Cast<AArchiveCharacter>(PlayerOwner->GetPawn());
    if (!Player || !Player->Chapter())
        return;
    auto& C = *Player->Chapter();
    const float W = Canvas->ClipX, H = Canvas->ClipY;
    const float Scale = FMath::Clamp(FMath::Min(W / 900.f, H / 560.f), .7, 1.8);
    UFont* Font = GEngine->GetMediumFont();
    const FLinearColor Paper(.96, .91, .80), Gold(1, .73, .38), Ink(.015, .018, .026, .91);
    enum class EBacking { None, TopLeft, TopCenter, BottomCenter };
    auto Label = [&](const FString& S, float X, float Y, float MaxWidth, float Scl, FLinearColor Color,
                     EBacking Backing = EBacking::None) {
        TArray<FString> Words;
        S.ParseIntoArrayWS(Words);
        FString Line;
        TArray<FString> Lines;
        const float LineHeight = 24 * Scl;
        float LineWidth = 0, Widest = 0;
        for (const auto& Word : Words)
        {
            FString Next = Line.IsEmpty() ? Word : Line + TEXT(" ") + Word;
            float TW, TH;
            GetTextSize(Next, TW, TH, Font, Scl);
            if (TW > MaxWidth && !Line.IsEmpty())
            {
                Lines.Add(Line);
                Widest = FMath::Max(Widest, LineWidth);
                Line = Word;
                GetTextSize(Word, LineWidth, TH, Font, Scl);
            }
            else
            {
                Line = Next;
                LineWidth = TW;
            }
        }
        Lines.Add(Line);
        Widest = FMath::Max(Widest, LineWidth);
        if (Backing != EBacking::None)
        {
            const float PadX = 10 * Scl, PadY = 5 * Scl;
            if (Backing == EBacking::TopCenter || Backing == EBacking::BottomCenter)
                X -= Widest / 2;
            if (Backing == EBacking::BottomCenter)
                Y -= Lines.Num() * LineHeight;
            DrawRect(Ink, X - PadX, Y - PadY, Widest + 2 * PadX, Lines.Num() * LineHeight + 2 * PadY);
        }
        for (const FString& Row : Lines)
        {
            DrawText(Row, Color, X, Y, Font, Scl);
            Y += LineHeight;
        }
        return Y;
    };
    const float M = FMath::Max(12.f, W * .025f);
    if (C.Screen != EArchiveScreen::Play)
    {
        DrawRect(Ink, 0, 0, W, H);
        bool Ending = C.Screen == EArchiveScreen::Ending;
        if (Ending && C.Restored)
        {
            float PhotoW = FMath::Min(W * .72f, H * .82f), PhotoH = PhotoW * .75f;
            DrawTexture(C.Restored, (W - PhotoW) / 2, H * .04f, PhotoW, PhotoH, 0, 0, 1, 1);
        }
        float Y = Ending ? H * .69f : H * .30f, X = W * .13f, Width = W * .75f;
        FString Header = C.Screen == EArchiveScreen::Title    ? C.Text(TEXT("menu.title"))
                         : C.Screen == EArchiveScreen::Paused ? C.Text(TEXT("menu.paused"))
                         : Ending                             ? C.Text(TEXT("story.ending"))
                                                              : C.Text(TEXT("menu.fall"));
        Y = Label(Header, X, Y, Width, Scale * 1.7f, Gold) + M * .35f;
        if (C.Screen == EArchiveScreen::Title)
        {
            Y = Label(C.Text(C.HasSave() ? TEXT("menu.continue") : TEXT("menu.begin")), X, Y, Width, Scale,
                      Paper);
            if (C.HasSave())
                Y = Label(C.Text(TEXT("menu.new")), X, Y, Width, Scale, Paper);
            Label(C.Text(TEXT("menu.controls")), X, Y + M * .5f, Width, Scale * .85f, Paper);
        }
        else if (Ending)
        {
            Y = Label(C.Text(TEXT("story.event.name-restored")), X, Y, Width, Scale, Paper);
            Label(C.Text(TEXT("menu.return")), X, Y, Width, Scale, Gold);
        }
        else
            Label(C.Text(C.Screen == EArchiveScreen::Paused ? TEXT("menu.resume") : TEXT("menu.retry")), X, Y,
                  Width, Scale, Paper);
        return;
    }
    const FString Focus = C.AimId(*Player);
    Label(C.Objective(), M + 10 * Scale, M + 5 * Scale, FMath::Min(535 * Scale, W * .65f), Scale, Paper,
          EBacking::TopLeft);
    DrawRect(Focus.IsEmpty() ? Paper : Gold, W * .5f - 2, H * .5f - 2, 4, 4);
    if (!Focus.IsEmpty())
        Label(TEXT("E  ") + C.Prompt(Focus), W * .5f, H * .55f, W * .8f, Scale, Gold, EBacking::TopCenter);
    if (!C.Subtitle.IsEmpty())
        Label(C.Subtitle, W * .5f, H * .94f, W * .8f, Scale * 1.1f, Paper, EBacking::BottomCenter);
}
