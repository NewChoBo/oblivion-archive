#include "ArchiveConstruction.h"
#include "ArchiveChapter.h"
#include "Components/PointLightComponent.h"
#include "Components/PrimitiveComponent.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "ProceduralMeshComponent.h"

void FArchiveConstruction::Tag(UPrimitiveComponent* Surface, const FString& Id, FVector At, float Range)
{
    Chapter.Targets.Add(Surface, Id);
    Chapter.Approaches.Add(Id, Cm(At));
    Chapter.Ranges.Add(Id, 100 * Range);
}

USceneComponent* FArchiveConstruction::Glyph(USceneComponent* Parent, int32 Symbol, float Scale)
{
    auto* G = Group(TEXT("Glyph"), Parent, FVector(0, 0, -.028));
    G->SetRelativeScale3D(FVector(Scale));
    auto Line = [&](double X, double Y, double U, double V, double Width = .075) {
        FVector A(X, Y, 0), B(U, V, 0);
        auto* Bar = Box(TEXT("engraving"), G, (A + B) / 2, FVector(Width, (B - A).Length(), .045),
                        TEXT("runeGold"), false);
        Bar->SetRelativeRotation(FRotationMatrix::MakeFromZ(Cm(B - A)).Rotator());
    };
    if (Symbol == 0)
    {
        Line(-.34, .25, .34, .25);
        Line(-.23, -.32, .23, -.32);
        Line(-.32, .22, -.19, -.3);
        Line(.32, .22, .19, -.3);
        Line(-.16, .26, 0, .48);
        Line(0, .48, .16, .26);
        Line(0, -.17, .05, .06, .12);
    }
    else if (Symbol == 1)
    {
        Line(-.36, -.44, .28, .42);
        Line(-.2, -.18, -.19, .17);
        Line(-.19, .17, .28, .42);
        Line(.28, .42, .15, .03);
        Line(.15, .03, -.2, -.18);
    }
    else
        for (int I = 0; I < 2; ++I)
        {
            double Y = .12 - I * .24;
            Line(-.43, Y, -.23, Y + .12);
            Line(-.23, Y + .12, 0, Y - .08);
            Line(0, Y - .08, .21, Y + .08);
            Line(.21, Y + .08, .42, Y);
        }
    return G;
}

void FArchiveConstruction::Furnish()
{
    auto* Root = Chapter.GetRootComponent();
    // The citadel's east library wing supplies the paving and its collision under the vault
    // and return passage. The shared corridor-floor and return-link meet it at survey x = 9.5 m.
    Box(TEXT("return-south"), Root, {13.1, 1.65, 4.25}, {7.2, 3.3, .2}, MasonryFinish, true);
    Box(TEXT("return-east"), Root, {16.8, 1.65, 5.78}, {.2, 3.3, 3.06}, MasonryFinish, true);
    Box(TEXT("return-north"), Root, {10.775, 1.65, 7.2}, {2.55, 3.3, .2}, MasonryFinish, true);
    Box(TEXT("return-shoulder"), Root, {9.41, 1.65, 6.89}, {.18, 3.3, .88}, MasonryFinish, true);
    Box(TEXT("return-ceiling"), Root, {13.1, 3.48, 5.825}, {7.2, .16, 2.95}, TEXT("wood"), true);
    auto* North = Group(TEXT("north-door"), Root, {0, 1.49, 7.42});
    Box(TEXT("north-door"), North, FVector::ZeroVector, {2.24, 2.98, .16}, TEXT("wood"), true);
    for (auto* Door : {North, Instances[TEXT("vault-gate")], Instances[TEXT("vault-shortcut-door")],
                       Instances[TEXT("reading-shortcut-door")]})
    {
        Chapter.Doors.Add(Door);
        Chapter.DoorOrigins.Add(Door->GetRelativeLocation());
    }
    auto* Frame =
        Box(TEXT("photograph"), Root, {.5, 1.59, 1.8}, {.75, .58, .065}, TEXT("chestHardware"), true);
    Tag(Frame, TEXT("photo"), {.4, 0, .85}, 1.55);
    // Separate photographic print from its wooden frame. The quad supplies its own UV orientation.
    auto* Print = NewObject<UProceduralMeshComponent>(&Chapter);
    Chapter.AddInstanceComponent(Print);
    Print->SetupAttachment(Root);
    Print->RegisterComponent();
    Print->SetCollisionEnabled(ECollisionEnabled::NoCollision);
    constexpr double Front = 1.765;
    TArray<FVector> Vertices = {Cm(.17, 1.342, Front), Cm(.83, 1.342, Front), Cm(.83, 1.838, Front),
                                Cm(.17, 1.838, Front)};
    Print->CreateMeshSection_LinearColor(
        0, Vertices, {0, 1, 2, 0, 2, 3},
        {FVector(-1, 0, 0), FVector(-1, 0, 0), FVector(-1, 0, 0), FVector(-1, 0, 0)},
        {FVector2D(0, 1), FVector2D(1, 1), FVector2D(1, 0), FVector2D(0, 0)}, {}, {}, false);
    auto* PhotoMat = LoadObject<UMaterialInterface>(
        nullptr, TEXT("/Engine/EngineMaterials/EmissiveTexturedMaterial.EmissiveTexturedMaterial"));
    if (PhotoMat)
    {
        Chapter.PhotoMaterial = UMaterialInstanceDynamic::Create(PhotoMat, &Chapter);
        Print->SetMaterial(0, Chapter.PhotoMaterial);
    }
    auto* Mural = Group(TEXT("mural"), Root, {3.6, 1.5, 12.24});
    for (int32 I = 0; I < 3; ++I)
    {
        auto* Panel = Group(TEXT("relief"), Mural, {(I - 1) * .6, 0, 0});
        auto* Back = Box(TEXT("mural"), Panel, FVector::ZeroVector, {.55, .95, .08}, TEXT("darkWood"), true);
        Tag(Back, TEXT("mural"), {3.6, 0, 11.45}, 1.6);
        Glyph(Group(TEXT("face"), Panel, {0, 0, -.032}), I, .44);
        FString Plinth = FString::Printf(TEXT("corridor-rune-%d"), I + 1),
                Id = FString::Printf(TEXT("rune%d"), I);
        double Z = 11.35 - I * 1.05 + PlinthShift;
        auto* Mark = Group(TEXT("seal-face"), Root, {9.22, .86, Z}, 90);
        auto* Plate =
            Box(TEXT("seal-plate"), Mark, FVector::ZeroVector, {.35, .35, .04}, TEXT("chestHardware"), true);
        Tag(Chapter.FindPart(FName(Plinth)), Id, {9.4, 0, Z}, .95);
        Tag(Plate, Id, {9.4, 0, Z}, .95);
        TArray<TWeakObjectPtr<USceneComponent>> Variants;
        for (int G = 0; G < 3; ++G)
            Variants.Add(Glyph(Mark, G, .29));
        Chapter.Glyphs.Add(MoveTemp(Variants));
    }
    auto* VaultDoor = Chapter.FindPart(TEXT("vault-gate"));
    Tag(VaultDoor, TEXT("seal"), {11.9, 0, 10.3}, 1.3);
    auto* Plate = Box(TEXT("vault-seal"), Instances[TEXT("vault-gate")], {0, .06, -.17}, {.35, .36, .06},
                      TEXT("runeGold"), true);
    Tag(Plate, TEXT("seal"), {11.9, 0, 10.3}, 1.3);
    auto* Book =
        Box(TEXT("signature-register"), Root, {15.65, 1.2, 10.3}, {.48, .08, .7}, TEXT("paper"), true);
    for (int I = 0; I < 7; ++I)
        Box(TEXT("signature"), Root, {15.65, 1.241, 10.08 + .065 * I}, {I % 2 == 0 ? .32 : .24, .002, .009},
            TEXT("ink"), false);
    Tag(Book, TEXT("ledger"), {15, 0, 10.3}, 1.5);
    Tag(Chapter.FindPart(TEXT("vault-lectern")), TEXT("ledger"), {15, 0, 10.3}, 1.5);
    auto* Latch = Box(TEXT("latch"), Instances[TEXT("vault-shortcut-door")], {-.14, -.1, 0}, {.1, .12, .76},
                      TEXT("runeGold"), true);
    Tag(Latch, TEXT("shortcut"), {15.4, 0, 8.5}, 1.25);
    Tag(Chapter.FindPart(TEXT("vault-shortcut-door")), TEXT("shortcut"), {15.4, 0, 8.5}, 1.25);
    auto Lamp = [&](FVector Where, float Brightness, float Range) {
        auto* Light = NewObject<UPointLightComponent>(&Chapter);
        Chapter.AddInstanceComponent(Light);
        Light->SetupAttachment(Root);
        Light->SetRelativeLocation(Cm(Where));
        Light->SetCastShadows(false);
        Light->SetIntensityUnits(ELightUnits::Lumens);
        Light->SetIntensity(Brightness);
        Light->SetAttenuationRadius(Range * 100);
        Light->SetLightColor(FLinearColor(1, .78, .52));
        Light->RegisterComponent();
    };
    Lamp({1.23, 1.55, 1.42}, 500, 7.5);
    Lamp({-1.4, 2.5, -3.4}, 550, 8);
    Lamp({1.8, 2.25, 11.8}, 650, 7);
    Lamp({6.8, 2.25, 8.8}, 600, 6.5);
    Lamp({10.8, 2.25, 11.85}, 580, 6);
    Lamp({15.35, 1.65, 9.65}, 540, 7);
    Lamp({10.4, 2.2, 5.9}, 480, 7);
}
