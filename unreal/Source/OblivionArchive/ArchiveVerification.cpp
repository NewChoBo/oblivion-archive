#include "ArchiveVerification.h"
#if !UE_BUILD_SHIPPING
#include "ArchiveChapter.h"
#include "ArchiveCitadel.h"
#include "ArchiveConstruction.h"
#include "ArchivePlayer.h"
#include "ArchivePropMesh.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Components/StaticMeshComponent.h"
#include "GameFramework/PlayerController.h"
#include "Kismet/GameplayStatics.h"
#include "Materials/MaterialInterface.h"
#include "Misc/CommandLine.h"

void ArchiveVerify(AArchiveGameMode& Game)
{
    int32 Passed = 0, Failed = 0;
    auto Check = [&](const TCHAR* Name, bool OK) {
        if (OK)
        {
            ++Passed;
            UE_LOG(LogTemp, Display, TEXT("ARCHIVE CHECK PASS %s"), Name);
        }
        else
        {
            ++Failed;
            UE_LOG(LogTemp, Error, TEXT("ARCHIVE CHECK FAIL %s"), Name);
        }
    };
    auto* World = Game.GetWorld();
    auto* Player = Cast<AArchiveCharacter>(UGameplayStatics::GetPlayerPawn(World, 0));
    auto* Story = Game.Chapter.Get();
    Check(TEXT("startup: local first-person pawn, camera, world and title"),
          Player && Story && Player->Eyes() && Story->Screen == EArchiveScreen::Title);
    if (!Player || !Story)
    {
        FPlatformMisc::RequestExitWithStatus(false, 1);
        return;
    }
    for (const FName Tag : {FName("photograph"), FName("north-door"), FName("return-link")})
    {
        if (auto* Comp = Story->FindPart(Tag))
            UE_LOG(LogTemp, Display,
                   TEXT("ARCHIVE surface %s location %s extent %s profile %s collision body=%d"),
                   *Tag.ToString(), *Comp->GetComponentLocation().ToCompactString(),
                   *Comp->Bounds.BoxExtent.ToCompactString(), *Comp->GetCollisionProfileName().ToString(),
                   Comp->IsPhysicsStateCreated());
    }
    auto Trace = [&](FVector From, FVector To, const AActor* Ignore = nullptr) {
        FHitResult Hit;
        FCollisionQueryParams Query(SCENE_QUERY_STAT(ArchiveGeometryTest), true, Player);
        if (Ignore)
            Query.AddIgnoredActor(Ignore);
        World->LineTraceSingleByChannel(Hit, FArchiveConstruction::Cm(From),
                                        FArchiveConstruction::Cm(To), ECC_Visibility, Query);
        return Hit;
    };
    auto* Castle = Story->GetCastle();
    if (FParse::Param(FCommandLine::Get(), TEXT("ArchiveVerifyFab")))
    {
        auto* Shelf = ArchivePropMesh::Load(TEXT("/Game/LocalVendor/Archive/SM_Shelf_01.SM_Shelf_01"));
        auto* Crate = ArchivePropMesh::Load(TEXT("/Game/LocalVendor/Archive/SM_Crate_01.SM_Crate_01"));
        Check(TEXT("owned shelf and freight meshes are installed"), Shelf && Crate);
        TInlineComponentArray<UStaticMeshComponent*> Components(Story);
        int32 ReadingBays = 0, VaultBays = 0;
        for (auto* Part : Components)
        {
            if (!Shelf || Part->GetStaticMesh() != Shelf || !Part->IsVisible() ||
                Part->GetCollisionEnabled() != ECollisionEnabled::NoCollision)
                continue;
            const FBoxSphereBounds& Bounds = Part->Bounds;
            if (FMath::Abs(Bounds.Origin.Z - Bounds.BoxExtent.Z) > .2)
                continue;
            if (Bounds.BoxExtent.Equals(FVector(52.5, 30, 145), .2))
                ++ReadingBays;
            if (Bounds.BoxExtent.Equals(FVector(65, 20, 130), .2))
                ++VaultBays;
        }
        Check(TEXT("twelve reading bays and four vault bays fit the plan and stand on the floor"),
              ReadingBays == 12 && VaultBays == 4);
        const auto* Wall = Story->FindPart(TEXT("corridor-wall-east"));
        const auto* Finish = Wall ? Wall->GetMaterial(0) : nullptr;
        Check(TEXT("corridor uses the authored tiled masonry"),
              Finish && Finish->GetPathName() == TEXT("/Game/LocalVendor/Archive/M_ArchiveMasonry.M_ArchiveMasonry"));
    }
    Check(TEXT("citadel source mesh and solid counts"), Castle && Castle->GetSourcePartCount() == 708 &&
                                                            Castle->GetSolidPartCount() == 478 &&
                                                            Castle->GetTriangleCount() == 69515);
    if (Castle)
    {
        UStaticMesh* Model = ArchivePropMesh::Load(TEXT("/Game/LocalVendor/Archive/SM_Crate_01.SM_Crate_01"));
        TInlineComponentArray<UStaticMeshComponent*> Meshes(Castle);
        const auto Crates = Meshes.FilterByPredicate(
            [&](const auto* Mesh) { return Model && Mesh->GetStaticMesh() == Model; });
        Check(TEXT("optional freight model replaces precisely five stationary crates"),
              Crates.Num() == (Model ? 5 : 0));
        for (const FVector& Center :
             {FVector(27, -4.017, -36.925), FVector(25.45, -4.017, -36.925),
              FVector(25.45, -3.051, -36.925), FVector(23.9, -4.017, -36.925),
              FVector(20, -4.017, -30.225)})
        {
            const auto Hit = Trace(Center + FVector(.68, 0, 0), Center + FVector(.45, 0, 0));
            const FVector Face = FArchiveConstruction::Cm(Center + FVector(.575, 0, 0));
            Check(TEXT("freight shell retains its original blocking face"),
                  Hit.GetActor() == Castle && Hit.GetComponent() && Hit.ImpactPoint.Equals(Face, .2) &&
                      Hit.GetComponent()->IsVisible() == (Model == nullptr));
            if (Model)
                Check(TEXT("crate artwork fits its shell without a second collision surface"),
                      Crates.ContainsByPredicate([&](const auto* Mesh) {
                          return Mesh->IsVisible() && Mesh->GetCollisionEnabled() == ECollisionEnabled::NoCollision &&
                                 Mesh->Bounds.Origin.Equals(FArchiveConstruction::Cm(Center), .2) &&
                                 Mesh->Bounds.BoxExtent.Equals(FVector(50.6, 57.5, 48.3), .2);
                      }));
        }
    }
    for (auto P : {FVector(-15, -6.5, -78.625), FVector(-7.1, -5.5, -58.125), FVector(0, -4.5, -43.125)})
    {
        auto Hit = Trace(P + FVector(0, .65, 0), P - FVector(0, .55, 0));
        Check(*FString::Printf(TEXT("real exterior floor at x/z %.2f/%.2f"), P.X, P.Z),
              Hit.bBlockingHit && Hit.GetActor() == Castle && Hit.ImpactNormal.Z > .66 &&
                  FMath::Abs(Hit.ImpactPoint.Z - P.Y * 100) < 11);
    }
    // Either actor can win a first-hit query when two floor tops share a plane.
    // Trace again without the expected owner to catch the hidden second surface.
    auto CheckFloor = [&](const TCHAR* Name, double X, double Z, const AActor* Owner) {
        const FVector Above(X, .12, Z), Below(X, -.12, Z);
        const auto Hit = Trace(Above, Below);
        Check(Name, Owner && Hit.GetActor() == Owner && Hit.GetComponent() && Hit.GetComponent()->IsVisible() &&
                        Hit.ImpactNormal.Z > .99 && FMath::Abs(Hit.ImpactPoint.Z) < .1 &&
                        !Trace(Above, Below, Owner).bBlockingHit);
    };
    CheckFloor(TEXT("rune corridor joins the wing without a floor gap"), 9.47, 10.23, Story);
    CheckFloor(TEXT("only wing paving beyond the rune plinths"), 9.53, 10.23, Castle);
    CheckFloor(TEXT("only wing paving behind the quill"), 10.10, 10.76, Castle);
    CheckFloor(TEXT("only wing paving inside the sealed vault"), 13, 10, Castle);
    CheckFloor(TEXT("only wing paving beyond the shortcut latch"), 15.4, 5.45, Castle);
    CheckFloor(TEXT("return link meets the wing paving from the west"), 9.47, 5.45, Story);
    CheckFloor(TEXT("wing paving meets the return link from the east"), 9.53, 5.45, Castle);
    auto Look = [&](FVector Feet, FVector Point) {
        const FVector Center = FArchiveConstruction::Cm(Feet) +
                               FVector(0, 0, Player->GetCapsuleComponent()->GetScaledCapsuleHalfHeight() + 2);
        Player->SetActorLocation(Center, false, nullptr, ETeleportType::TeleportPhysics);
        FRotator Aim = (FArchiveConstruction::Cm(Point) - Player->Eyes()->GetComponentLocation()).Rotation();
        Player->Controller->SetControlRotation(Aim);
        Player->Eyes()->SetWorldRotation(Aim);
    };
    auto Use = [&](const TCHAR* Id, FVector Feet, FVector Point, int32 After) {
        Look(Feet, Point);
        const FString Focus = Story->AimId(*Player);
        if (Focus != Id)
        {
            FHitResult Hit;
            FVector Eye = Player->Eyes()->GetComponentLocation();
            World->LineTraceSingleByChannel(
                Hit, Eye, Eye + Player->Eyes()->GetForwardVector() * 280, ECC_Visibility,
                FCollisionQueryParams(SCENE_QUERY_STAT(ArchiveMiss), false, Player));
            UE_LOG(LogTemp, Warning, TEXT("ARCHIVE focus miss %s eye %s hit actor %s component %s"), Id,
                   *Eye.ToCompactString(), *GetNameSafe(Hit.GetActor()), *GetNameSafe(Hit.GetComponent()));
        }
        bool Used = Story->Interact(*Player);
        Check(*FString::Printf(TEXT("ray interaction %s (first hit %s, resulting phase %d)"), Id, *Focus,
                               Story->GetPhase()),
              Focus == Id && Used && Story->GetPhase() == After);
    };
    Story->NewChapter(*Player);
    Check(TEXT("north gate blocks the starting route"), Trace({0, 1.56, 6.35}, {0, 1.56, 7.85}).bBlockingHit);
    Look({.5, 0, .12}, {.5, 1.56, -1});
    Check(TEXT("turning away cannot use the photograph"), !Story->Interact(*Player));
    Use(TEXT("photo"), {.5, 0, .12}, {.5, 1.59, 1.8}, 1);
    Story->Tick(2);
    Check(TEXT("opened north arch has standing clearance"),
          !Trace({0, 1.56, 6.35}, {0, 1.56, 7.85}).bBlockingHit);
    Check(TEXT("solid arch pier"), Trace({1.25, 1.56, 6.35}, {1.25, 1.56, 7.3}).bBlockingHit);
    Use(TEXT("mural"), {3.6, 0, 11.18}, {3.6, 1.5, 12.24}, 1);
    Check(TEXT("clue preserved"), Story->HasClue());
    Use(TEXT("seal"), {11, 0, 10.3}, {11.9, 1.56, 10.3}, 1);
    Use(TEXT("rune0"), {8.66, 0, 11.8}, {9.22, .86, 11.81}, 1);
    Story->Fall();
    Check(TEXT("game over"), Story->Screen == EArchiveScreen::Defeated);
    Story->Retry(*Player);
    Check(TEXT("checkpoint retry keeps clue, rolls back unsaved rune turn"),
          Story->GetRunes()[0] == 2 && Story->HasClue() && Story->GetPhase() == 1);
    Use(TEXT("rune0"), {8.66, 0, 11.8}, {9.22, .86, 11.81}, 1);
    Use(TEXT("rune1"), {8.66, 0, 10.76}, {9.22, .86, 10.76}, 1);
    Use(TEXT("rune1"), {8.66, 0, 10.76}, {9.22, .86, 10.76}, 1);
    Use(TEXT("seal"), {11, 0, 10.3}, {11.9, 1.56, 10.3}, 2);
    Story->Tick(2);
    Check(TEXT("vault gate raised, ray passes through"),
          !Trace({11.42, 1.4, 10.3}, {12.38, 1.4, 10.3}).bBlockingHit);
    Use(TEXT("ledger"), {14.54, 0, 10.3}, {15.65, 1.2, 10.3}, 3);
    Use(TEXT("shortcut"), {15.4, 0, 8.45}, {15.4, 1.40, 7.25}, 4);
    Story->Tick(2);
    Check(TEXT("west shortcut passes through reading-room side door"),
          !Trace({9, 1.44, 5.4}, {7.95, 1.44, 5.4}).bBlockingHit);
    Use(TEXT("photo"), {.5, 0, .12}, {.5, 1.59, 1.8}, 5);
    Check(TEXT("restored ending"),
          Story->Screen == EArchiveScreen::Ending && Story->Faded && Story->Restored);
    const FString Slot = TEXT("Archive.Automation.Chapter");
    auto* Saved = Cast<UArchiveCheckpoint>(UGameplayStatics::LoadGameFromSlot(Slot, 0));
    Check(TEXT("saved chapter read back from disk"),
          Saved && Saved->Phase == 5 && Saved->Clue && Saved->Runes == TArray<int32>({0, 1, 2}));
    UGameplayStatics::DeleteGameInSlot(Slot, 0);
    UE_LOG(LogTemp, Display, TEXT("ARCHIVE VERIFY RESULT passed=%d failed=%d"), Passed, Failed);
    FPlatformMisc::RequestExitWithStatus(false, Failed ? 1 : 0);
}
#endif
