#include "ArchiveConstruction.h"
#include "ArchiveChapter.h"
#include "ArchiveData.h"
#include "ArchivePropMesh.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Misc/PackageName.h"
#include "ProceduralMeshComponent.h"

using namespace ArchiveData;

UMaterialInterface* FArchiveConstruction::Material(const FString& Name, const FColor& Color)
{
    auto* Mat = UMaterialInstanceDynamic::Create(BaseMaterial, &Chapter);
    Mat->SetVectorParameterValue(TEXT("Color"), FLinearColor::FromSRGBColor(Color));
    Materials.Add(Name, Mat);
    return Mat;
}

USceneComponent* FArchiveConstruction::Group(const FString& Id, USceneComponent* Parent, FVector Local,
                                             float Yaw)
{
    auto* G = NewObject<USceneComponent>(&Chapter);
    Chapter.AddInstanceComponent(G);
    G->SetupAttachment(Parent ? Parent : Chapter.GetRootComponent());
    G->SetRelativeLocationAndRotation(Cm(Local), FRotator(0, Yaw, 0));
    G->ComponentTags.Add(FName(Id));
    G->RegisterComponent();
    return G;
}

UPrimitiveComponent* FArchiveConstruction::Box(const FString& Id, USceneComponent* Parent, FVector Center,
                                               FVector Size, const FString& Finish, bool Solid)
{
    auto* B = NewObject<UStaticMeshComponent>(&Chapter);
    Chapter.AddInstanceComponent(B);
    B->SetupAttachment(Parent);
    B->SetStaticMesh(Cube);
    B->SetRelativeLocation(Cm(Center));
    B->SetRelativeScale3D(Cm(Size) / 100);
    B->SetMaterial(0, Materials.FindRef(Finish));
    B->SetCollisionProfileName(Solid ? TEXT("BlockAllDynamic") : TEXT("NoCollision"));
    B->SetGenerateOverlapEvents(false);
    B->ComponentTags.Add(FName(Id));
    B->RegisterComponent();
    Chapter.Parts.FindOrAdd(FName(Id), B);
    return B;
}

void FArchiveConstruction::Wall(const TSharedPtr<FJsonObject>& Row, USceneComponent* Root,
                                const FString& PrefabFinish)
{
    const FString Id = String(Row, TEXT("id"));
    auto Bounds = Row->GetArrayField(TEXT("bounds"));
    FVector Lo, Hi;
    for (int I = 0; I < 3; ++I)
    {
        auto Pair = Bounds[I]->AsArray();
        Lo[I] = Pair[0]->AsNumber();
        Hi[I] = Pair[1]->AsNumber();
    }
    const bool AlongX = String(Row, TEXT("openingAxis")) == TEXT("x");
    const int32 Axis = AlongX ? 0 : 2, Normal = AlongX ? 2 : 0;
    const FVector Dimensions = Hi - Lo;
    const bool MasonryWall = PrefabFinish == TEXT("stone") && Dimensions.Y > FMath::Min(Dimensions.X, Dimensions.Z);
    const FString& Finish = MasonryWall ? MasonryFinish : PrefabFinish;
    auto Slab = [&](double A, double B, double Bottom, double Top) {
        if (B - A < .0001 || Top - Bottom < .0001)
            return;
        FVector Min = Lo, Max = Hi;
        Min[Axis] = A;
        Max[Axis] = B;
        Min.Y = Bottom;
        Max.Y = Top;
        Box(Id, Root, (Min + Max) / 2, Max - Min, Finish, true);
    };
    if (!Row->HasField(TEXT("frame")))
    {
        if (!Row->HasField(TEXT("openings")))
        {
            Box(Id, Root, (Hi + Lo) / 2, Hi - Lo, Finish, true);
            return;
        }
        // A span cutout leaves solid sill and lintel at the heights in the authored plan.
        double Start = Lo[Axis];
        for (auto& Item : Row->GetArrayField(TEXT("openings")))
        {
            auto Cut = Item->AsObject();
            auto Span = Cut->GetArrayField(TEXT("span")), Height = Cut->GetArrayField(TEXT("height"));
            double A = Span[0]->AsNumber(), B = Span[1]->AsNumber();
            Slab(Start, A, Lo.Y, Hi.Y);
            Slab(A, B, Lo.Y, Height[0]->AsNumber());
            Slab(A, B, Height[1]->AsNumber(), Hi.Y);
            Start = B;
        }
        Slab(Start, Hi[Axis], Lo.Y, Hi.Y);
        return;
    }
    const auto Frame = Plan->GetObjectField(TEXT("doorFrames"))->GetObjectField(String(Row, TEXT("frame")));
    const double Center = Frame->GetNumberField(TEXT("center")),
                 Radius = Frame->GetNumberField(TEXT("width")) / 2;
    const double Spring = Frame->GetNumberField(TEXT("spring"));
    Slab(Lo[Axis], Center - Radius, Lo.Y, Hi.Y);
    Slab(Center + Radius, Hi[Axis], Lo.Y, Hi.Y);
    const FString Shape = String(Frame, TEXT("shape"));
    if (Shape == TEXT("flat"))
    {
        Slab(Center - Radius, Center + Radius, Spring, Hi.Y);
        return;
    }
    const double Rise = Frame->GetNumberField(TEXT("rise"));
    TArray<FVector> V, Normals;
    TArray<FVector2D> UV;
    TArray<int32> T;
    auto P = [&](double U, double H, double Depth) {
        FVector Value;
        Value[Axis] = U;
        Value.Y = H;
        Value[Normal] = Depth;
        return Cm(Value);
    };
    auto Face = [&](FVector A, FVector B, FVector C, FVector D, FVector Out) {
        FVector N = FVector::CrossProduct(C - A, B - A).GetSafeNormal();
        if (FVector::DotProduct(N, Out) < 0)
        {
            Swap(B, D);
            N = -N;
        }
        int32 Index = V.Num();
        V.Append({A, B, C, D});
        T.Append({Index, Index + 1, Index + 2, Index, Index + 2, Index + 3});
        for (int I = 0; I < 4; ++I)
            Normals.Add(N);
        UV.Append({FVector2D(0, 1), FVector2D(1, 1), FVector2D(1, 0), FVector2D(0, 0)});
    };
    double Near = Lo[Normal], Far = Hi[Normal];
    auto H = [&](double U) {
        double X = FMath::Abs(U - Center);
        if (Shape == TEXT("round"))
            return Spring + Rise * FMath::Sqrt(FMath::Max(0., 1. - X * X / (Radius * Radius)));
        double R = (Radius * Radius + Rise * Rise) / (2 * Radius);
        return Spring + FMath::Sqrt(FMath::Max(0., R * R - FMath::Square(X + R - Radius)));
    };
    // The same tessellated intrados supplies the opening and its triangle collision.
    constexpr int Steps = 48;
    FVector Front = (P(0, 0, Near) - P(0, 0, Far)).GetSafeNormal();
    for (int I = 0; I < Steps; ++I)
    {
        double A = Center - Radius * FMath::Cos(PI * I / Steps),
               B = Center - Radius * FMath::Cos(PI * (I + 1) / Steps);
        double HA = H(A), HB = H(B);
        Face(P(A, HA, Near), P(B, HB, Near), P(B, Hi.Y, Near), P(A, Hi.Y, Near), Front);
        Face(P(A, HA, Far), P(B, HB, Far), P(B, Hi.Y, Far), P(A, Hi.Y, Far), -Front);
        Face(P(A, HA, Near), P(A, HA, Far), P(B, HB, Far), P(B, HB, Near), FVector::DownVector);
    }
    Face(P(Center - Radius, Hi.Y, Near), P(Center + Radius, Hi.Y, Near), P(Center + Radius, Hi.Y, Far),
         P(Center - Radius, Hi.Y, Far), FVector::UpVector);
    auto* Mesh = NewObject<UProceduralMeshComponent>(&Chapter);
    Chapter.AddInstanceComponent(Mesh);
    Mesh->SetupAttachment(Root);
    Mesh->bUseComplexAsSimpleCollision = true;
    Mesh->SetCollisionProfileName(TEXT("BlockAll"));
    Mesh->RegisterComponent();
    Mesh->CreateMeshSection_LinearColor(0, V, T, Normals, UV, {}, {}, true);
    Mesh->SetMaterial(0, Materials.FindRef(Finish));
}

void FArchiveConstruction::Place(const TSharedPtr<FJsonObject>& Row)
{
    const FString Id = String(Row, TEXT("id")), Kind = String(Row, TEXT("prefab"));
    const auto Prefab = Catalog->GetObjectField(TEXT("prefabs"))->GetObjectField(Kind);
    FVector Pos = Vec(Row, TEXT("position"));
    if (Kind == TEXT("rune-plinth"))
        Pos.Z += PlinthShift;
    double Heading = 0;
    Row->TryGetNumberField(TEXT("heading"), Heading);
    auto* Root = Group(Id, nullptr, Pos, Heading);
    Instances.Add(Id, Root);
    for (auto& Item : Prefab->GetArrayField(TEXT("parts")))
    {
        auto Part = Item->AsObject();
        FString Mat = String(Part, TEXT("material"),
                             Kind == TEXT("rune-plinth") || Kind == TEXT("fallen-stone") ||
                                     Kind == TEXT("corridor-pier")
                                 ? TEXT("stone")
                                 : TEXT("wood"));
        if (Row->HasField(TEXT("bounds")))
        {
            Wall(Row, Root, Mat);
            continue;
        }
        FVector Size = Vec(Row, TEXT("size"), Vec(Part, TEXT("size")));
        FVector At = Vec(Part, TEXT("offset"));
        if (String(Part, TEXT("shape")) == TEXT("ground"))
        {
            Size.Y = .2;
            At.Y -= .1;
        }
        if (Size.GetMin() <= 0)
            continue;
        if (Kind == TEXT("folio-bookcase"))
        {
            bool LongX = Size.X >= Size.Z;
            auto Shelve = [&](FVector Where, FVector Dimensions, const FString& Finish, bool Solid) {
                if (!LongX)
                {
                    Swap(Where.X, Where.Z);
                    Swap(Dimensions.X, Dimensions.Z);
                }
                return Box(Id, Root, Where, Dimensions, Finish, Solid);
            };
            double W = LongX ? Size.X : Size.Z, D = LongX ? Size.Z : Size.X, H = Size.Y;
            if (FolioShelf)
            {
                const FVector SourceSize = FolioShelf->GetBoundingBox().GetSize();
                const bool LongNativeX = SourceSize.X >= SourceSize.Y;
                const bool TargetLongNativeX = Size.Z >= Size.X;
                const float Yaw = LongNativeX == TargetLongNativeX ? 0.f : 90.f;
                // The reading-room bays are wide enough for two of the publisher's 96 cm shelves.
                const int32 Bays = W >= 2.0 ? 2 : 1;
                const double Span = W / Bays;
                for (int32 Bay = 0; Bay < Bays; ++Bay)
                {
                    const double Mid = -.5 * W + (Bay + .5) * Span;
                    const FVector Center = Cm(LongX ? FVector(Mid, 0, 0) : FVector(0, 0, Mid));
                    const FVector Half = .5 * Cm(LongX ? FVector(Span, H, D) : FVector(D, H, Span));
                    ArchivePropMesh::Place(Root, FolioShelf, FBox(Center - Half, Center + Half), Yaw);

                    // Normalized shelf tops measured on SM_Shelf_01 LOD0, from the feet upwards.
                    // The books stand on the actual timber and leave the uppermost ledge free.
                    constexpr double Decks[] = {.183, .428, .674, .879};
                    for (int32 Side : {-1, 1})
                        Shelve({Mid + Side * Span * .45, 0, 0}, {.08 * Span, H, D}, Mat, true)
                            ->SetVisibility(false);
                    for (int32 Tier = 0; Tier < UE_ARRAY_COUNT(Decks); ++Tier)
                    {
                        const double Top = H * (Decks[Tier] - .5);
                        Shelve({Mid, Top - .03, 0}, {Span * .85, .06, D}, Mat, true)->SetVisibility(false);
                        if (Tier + 1 == UE_ARRAY_COUNT(Decks))
                            break;
                        for (int32 J = 0; J < 5; ++J)
                        {
                            const double Height = H * (.10 + .014 * ((J + Bay + Tier) % 3));
                            Shelve({Mid + Span * (-.28 + .13 * J), Top + .5 * Height, 0},
                                   {Span * .114, Height, D * .63},
                                   (J + Bay + Tier) % 3 ? TEXT("darkWood") : TEXT("red"), true);
                        }
                    }
                }
                continue;
            }
            for (int Side : {-1, 1})
                Shelve({Side * (W / 2 - .04), 0, 0}, {.08, H, D}, TEXT("darkWood"), true);
            for (int Level = 0; Level < 5; ++Level)
            {
                double Y = -H / 2 + .045 + Level * (H - .09) / 4;
                Shelve({0, Y, 0}, {W - .16, .09, D}, TEXT("wood"), true);
                if (Level == 4)
                    break;
                for (int J = 0; J < 8; ++J)
                {
                    double BookH = H * (.13 + .025 * ((J + Level) % 3));
                    Shelve({(-.41 + .117 * J) * W, Y + .045 + BookH / 2, 0}, {.08 * W, BookH, D * .76},
                           (J + Level) % 3 == 0 ? TEXT("red") : TEXT("darkWood"), true);
                }
            }
            continue;
        }
        Box(Id, Root, At, Size, Mat, Flag(Part, TEXT("collision")));
    }
}

bool FArchiveConstruction::Build()
{
    Plan = Read(TEXT("chapter-1.json"));
    Catalog = Read(TEXT("environment-prefabs.json"));
    auto Work = Read(TEXT("work-layout.json"));
    if (!Plan || !Catalog || !Work)
        return false;
    PlinthShift = Work->GetObjectField(TEXT("corridor"))->GetNumberField(TEXT("plinthShiftZ"));
    Cube = LoadObject<UStaticMesh>(nullptr, TEXT("/Engine/BasicShapes/Cube.Cube"));
    BaseMaterial = LoadObject<UMaterialInterface>(
        nullptr, TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
    FolioShelf = ArchivePropMesh::Load(TEXT("/Game/LocalVendor/Archive/SM_Shelf_01.SM_Shelf_01"));
    if (!Cube || !BaseMaterial)
        return false;
    for (auto& It : Catalog->GetObjectField(TEXT("materials"))->Values)
        Material(FString(It.Key.ToView()), FColor::FromHex(String(It.Value->AsObject(), TEXT("color"))));
    const FString MasonryPackage = TEXT("/Game/LocalVendor/Archive/M_ArchiveMasonry");
    if (FPackageName::DoesPackageExist(MasonryPackage))
    {
        if (auto* Masonry = LoadObject<UMaterialInterface>(nullptr, *(MasonryPackage + TEXT(".M_ArchiveMasonry"))))
        {
            MasonryFinish = TEXT("archiveMasonry");
            Materials.Add(MasonryFinish, Masonry);
        }
    }
    Material(TEXT("runeGold"), FColor(213, 177, 102));
    Material(TEXT("paper"), FColor(224, 202, 158));
    Material(TEXT("ink"), FColor(51, 42, 37));
    for (const TCHAR* Zone :
         {TEXT("readingRoom"), TEXT("readingShelves"), TEXT("corridor"), TEXT("vault"), TEXT("shortcut")})
        for (auto& Placement : Plan->GetObjectField(TEXT("zones"))->GetArrayField(Zone))
            Place(Placement->AsObject());
    Furnish();
    return true;
}
