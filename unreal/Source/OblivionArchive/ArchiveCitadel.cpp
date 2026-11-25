#include "ArchiveCitadel.h"
#include "ArchiveData.h"
#include "ArchivePropMesh.h"
#include "Components/PointLightComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/Texture2D.h"
#include "HAL/FileManager.h"
#include "ImageUtils.h"
#include "Materials/MaterialInstanceDynamic.h"
#include "Misc/Compression.h"
#include "ProceduralMeshComponent.h"
#include "UObject/ConstructorHelpers.h"

namespace
{
using FJsonArray = TArray<TSharedPtr<FJsonValue>>;
using FJson = TSharedPtr<FJsonObject>;

FJson ReadGzip(const FString& Path)
{
    constexpr int32 MaxEncoded = 20 * 1024 * 1024, MaxDecoded = 64 * 1024 * 1024;
    const int64 Size = IFileManager::Get().FileSize(*Path);
    TArray<uint8> Bytes;
    if (Size < 18 || Size > MaxEncoded || !FFileHelper::LoadFileToArray(Bytes, *Path) || Bytes.Num() < 18 ||
        Bytes[0] != 0x1f || Bytes[1] != 0x8b || Bytes[2] != 8)
        return nullptr;
    const uint8* Footer = &Bytes[Bytes.Num() - 4];
    const uint32 Length =
        uint32(Footer[0]) | uint32(Footer[1]) << 8 | uint32(Footer[2]) << 16 | uint32(Footer[3]) << 24;
    if (Length == 0 || Length > MaxDecoded)
        return nullptr;
    TArray<uint8> Raw;
    Raw.SetNumUninitialized(Length + 1);
    if (!FCompression::UncompressMemory(NAME_Gzip, Raw.GetData(), Length, Bytes.GetData(), Bytes.Num()))
        return nullptr;
    Raw[Length] = 0;
    FJson Json;
    return FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(FString(UTF8_TO_TCHAR(Raw.GetData()))),
                                        Json)
               ? Json
               : nullptr;
}

bool Numbers(const FJsonArray& Input, TArray<double>& Out)
{
    Out.Reset(Input.Num());
    for (const auto& Value : Input)
    {
        double N;
        if (!Value || Value->Type != EJson::Number || !Value->TryGetNumber(N) || !FMath::IsFinite(N))
            return false;
        Out.Add(N);
    }
    return true;
}

// Survey metres use +Z forward and +Y up. The cyclic permutation preserves rotation handedness.
FVector Axes(const TArray<double>& V, int32 I)
{
    return FVector(V[I + 2], V[I], V[I + 1]);
}

bool ReadPose(const FJsonArray& Source, FTransform& Pose)
{
    TArray<double> Values;
    if (Source.Num() != 10 || !Numbers(Source, Values))
        return false;
    const FVector S = Axes(Values, 7);
    FQuat Q(Values[5], Values[3], Values[4], Values[6]);
    if (S.GetMin() <= UE_SMALL_NUMBER || Q.SizeSquared() < UE_SMALL_NUMBER)
        return false;
    Q.Normalize();
    Pose = FTransform(Q, 100 * Axes(Values, 0), S);
    return true;
}

struct FBatch
{
    FString Material;
    bool Visible = false, Solid = false;
    bool TransportCrate = false, FreightHardware = false;
    int32 Phase = 0;
    TArray<FVector> Vertices, Normals;
    TArray<FVector2D> UV;
    TArray<int32> Triangles;
    TArray<FProcMeshTangent> Tangents;
    TArray<FTransform> Animation;
};

bool AddPart(const FJson& Part, TMap<FString, FBatch>& Batches, int32 PartIndex, int32& Solids,
             int32& TriangleCount, bool HasCrateModel)
{
    const FJsonArray *P, *N, *UV, *Indices, *Pose, *Motion = nullptr;
    FString Name, Material;
    bool Visible, Solid, DoubleSided;
    int32 Phase;
    if (!Part || !Part->TryGetStringField(TEXT("name"), Name) ||
        !Part->TryGetStringField(TEXT("material"), Material) ||
        !Part->TryGetArrayField(TEXT("positions"), P) || !Part->TryGetArrayField(TEXT("normals"), N) ||
        !Part->TryGetArrayField(TEXT("uv"), UV) || !Part->TryGetArrayField(TEXT("indices"), Indices) ||
        !Part->TryGetArrayField(TEXT("pose"), Pose) || !Part->TryGetNumberField(TEXT("phase"), Phase) ||
        !Part->TryGetBoolField(TEXT("visible"), Visible) ||
        !Part->TryGetBoolField(TEXT("collision"), Solid) ||
        !Part->TryGetBoolField(TEXT("doubleSided"), DoubleSided))
        return false;
    Part->TryGetArrayField(TEXT("motion"), Motion);
    const int32 Count = P->Num() / 3;
    if (Count < 3 || P->Num() % 3 || N->Num() != P->Num() || UV->Num() != Count * 2 || Indices->Num() < 3 ||
        Indices->Num() % 3 || Phase < 0 || Phase > 5)
        return false;

    FTransform T;
    TArray<double> Positions, Normals, Coordinates;
    if (!ReadPose(*Pose, T) || !Numbers(*P, Positions) || !Numbers(*N, Normals) || !Numbers(*UV, Coordinates))
        return false;
    // Static meshes of the same material/visibility/collision state share one component and one cook.
    // Freight pieces retain their surveyed local vertices so their sampled pivots remain intact.
    FString Key = FString::Printf(TEXT("%s_%d_%d_%d"), *Material, Phase, Visible, Solid);
    const bool Crate = HasCrateModel && !Motion && Visible && Solid && Phase == 0 &&
                       Name == TEXT("archive transport crate");
    const bool Hardware = HasCrateModel && !Motion && Visible && !Solid && Phase == 0 &&
                          Material == TEXT("gold") && Name.StartsWith(TEXT("east freight warehouse"));
    if (Motion)
        Key += FString::Printf(TEXT("_movable_%d"), PartIndex);
    else if (Crate)
        Key += FString::Printf(TEXT("_crate_%d"), PartIndex);
    else if (Hardware)
        Key += TEXT("_freight_hardware");
    FBatch& B = Batches.FindOrAdd(Key);
    B.Material = Material;
    B.Phase = Phase;
    B.Visible = Visible;
    B.Solid = Solid;
    B.TransportCrate = Crate;
    B.FreightHardware = Hardware;
    if (Motion)
    {
        if (Motion->Num() < 2)
            return false;
        for (const auto& Frame : *Motion)
        {
            const FJsonArray* Values;
            FTransform Sample;
            if (!Frame || !Frame->TryGetArray(Values) || !ReadPose(*Values, Sample))
                return false;
            B.Animation.Add(Sample);
        }
        T = FTransform::Identity;
    }
    const int32 Base = B.Vertices.Num(), TriBase = B.Triangles.Num();
    for (int32 I = 0; I < Count; ++I)
    {
        B.Vertices.Add(T.TransformPosition(100 * Axes(Positions, I * 3)));
        B.Normals.Add(T.TransformVectorNoScale(Axes(Normals, I * 3) / T.GetScale3D()).GetSafeNormal());
        // The authored UV already contains metric tiling and phase-consistent seam offsets.
        B.UV.Emplace(Coordinates[I * 2], 1.0 - Coordinates[I * 2 + 1]);
    }
    TArray<FVector> Tangent, Bitangent;
    Tangent.Init(FVector::ZeroVector, Count);
    Bitangent.Init(FVector::ZeroVector, Count);
    for (int32 I = 0; I < Indices->Num(); I += 3)
    {
        int32 V[3];
        for (int32 J = 0; J < 3; ++J)
        {
            double Index;
            const auto& Value = (*Indices)[I + J];
            if (!Value || !Value->TryGetNumber(Index) || Index < 0 || Index >= Count || Index != int32(Index))
                return false;
            V[J] = Base + int32(Index);
        }
        const FVector E1 = B.Vertices[V[1]] - B.Vertices[V[0]], E2 = B.Vertices[V[2]] - B.Vertices[V[0]];
        const FVector Front = FVector::CrossProduct(E2, E1);
        // The closed orrery rings include coincident seam vertices. Zero-area faces have no surface to cook.
        if (Front.SizeSquared() <= UE_SMALL_NUMBER)
            continue;
        const FVector2D A = B.UV[V[1]] - B.UV[V[0]], C = B.UV[V[2]] - B.UV[V[0]];
        double D = A.X * C.Y - A.Y * C.X;
        if (!FMath::IsNearlyZero(D))
            for (int32 J = 0; J < 3; ++J)
            {
                Tangent[V[J] - Base] += (E1 * C.Y - E2 * A.Y) / D;
                Bitangent[V[J] - Base] += (E2 * A.X - E1 * C.X) / D;
            }
        // Unreal triangle fronts are clockwise. Preserve the surveyed outward normals for Chaos too.
        if (FVector::DotProduct(Front, B.Normals[V[0]] + B.Normals[V[1]] + B.Normals[V[2]]) < 0)
            Swap(V[1], V[2]);
        B.Triangles.Append(V, 3);
    }
    for (int32 I = 0; I < Count; ++I)
    {
        const FVector& Normal = B.Normals[Base + I];
        FVector X = (Tangent[I] - Normal * FVector::DotProduct(Normal, Tangent[I])).GetSafeNormal();
        if (X.IsNearlyZero())
        {
            FVector Y;
            Normal.FindBestAxisVectors(X, Y);
        }
        B.Tangents.Emplace(X, FVector::DotProduct(FVector::CrossProduct(Normal, X), Bitangent[I]) < 0);
    }
    if (DoubleSided)
    {
        for (int32 I = 0; I < Count; ++I)
        {
            const int32 Old = Base + I;
            const FVector Point = B.Vertices[Old], Normal = -B.Normals[Old];
            const FVector2D Tex = B.UV[Old];
            FProcMeshTangent Back = B.Tangents[Old];
            Back.bFlipTangentY = !Back.bFlipTangentY;
            B.Vertices.Add(Point);
            B.Normals.Add(Normal);
            B.UV.Add(Tex);
            B.Tangents.Add(Back);
        }
        const int32 FrontEnd = B.Triangles.Num();
        for (int32 I = TriBase; I < FrontEnd; I += 3)
        {
            const int32 Back[] = {B.Triangles[I] + Count, B.Triangles[I + 2] + Count,
                                  B.Triangles[I + 1] + Count};
            B.Triangles.Append(Back, 3);
        }
    }
    Solids += Solid ? 1 : 0;
    TriangleCount += Indices->Num() / 3;
    return true;
}

int32 WindowPhase(const FString& Key)
{
    static const TMap<FString, int32> Phases = {{TEXT("gateLight"), 1},
                                                {TEXT("binderyLight"), 2},
                                                {TEXT("libraryLight"), 3},
                                                {TEXT("dockLight"), 4},
                                                {TEXT("roseLight"), 5}};
    return Phases.FindRef(Key);
}
} // namespace

AArchiveCitadel::AArchiveCitadel()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = false;
    SetRootComponent(CreateDefaultSubobject<USceneComponent>(TEXT("StarCrossing")));
    GetRootComponent()->SetMobility(EComponentMobility::Static);
    static ConstructorHelpers::FObjectFinder<UMaterialInterface> Stone(
        TEXT("/Engine/EngineDebugMaterials/VertexPaint_2Tex_Color.VertexPaint_2Tex_Color"));
    static ConstructorHelpers::FObjectFinder<UMaterialInterface> Tint(
        TEXT("/Engine/BasicShapes/BasicShapeMaterial.BasicShapeMaterial"));
    StoneParent = Stone.Object;
    TintParent = Tint.Object;
}

bool AArchiveCitadel::LoadBake(const FString& Path)
{
    if (SourceParts)
        return true;
    FJson Json = ReadGzip(Path);
    const FJsonArray *Parts, *Lamps;
    const FJson* Colors;
    int32 Version;
    double Seconds;
    if (!Json || !Json->TryGetNumberField(TEXT("version"), Version) || Version != 1 ||
        !Json->TryGetObjectField(TEXT("colors"), Colors) || !Json->TryGetArrayField(TEXT("parts"), Parts) ||
        Parts->IsEmpty() || !Json->TryGetArrayField(TEXT("lamps"), Lamps) ||
        !Json->TryGetNumberField(TEXT("duration"), Seconds) || !(Seconds > 0) || !TintParent)
    {
        UE_LOG(LogTemp, Error, TEXT("Could not open version 1 citadel bake %s"), *Path);
        return false;
    }
    TMap<FString, FBatch> Batches;
    UStaticMesh* CrateModel = ArchivePropMesh::Load(TEXT("/Game/LocalVendor/Archive/SM_Crate_01.SM_Crate_01"));
    int32 SolidCount = 0, TriangleCount = 0;
    for (int32 I = 0; I < Parts->Num(); ++I)
    {
        const FJson* Part;
        if (!(*Parts)[I] || !(*Parts)[I]->TryGetObject(Part) ||
            !AddPart(*Part, Batches, I, SolidCount, TriangleCount, CrateModel != nullptr))
        {
            UE_LOG(LogTemp, Error, TEXT("Invalid citadel part %d in %s"), I, *Path);
            return false;
        }
    }
    for (const auto& Pair : Batches)
    {
        FString Hex;
        if (!(*Colors)->TryGetStringField(Pair.Value.Material, Hex))
        {
            UE_LOG(LogTemp, Error, TEXT("Missing citadel finish %s"), *Pair.Value.Material);
            return false;
        }
    }
    const FJson Slots = ArchiveData::Read(TEXT("citadel-materials.json"));
    if (!Slots)
        return false;
    TMap<FString, UTexture2D*> Images;
    auto Texture = [&](const FJson& Slot, const TCHAR* Map) -> UTexture2D* {
        FString Relative;
        if (!Slot || !Slot->TryGetStringField(Map, Relative))
            return nullptr;
        if (UTexture2D** Cached = Images.Find(Relative))
            return *Cached;
        UTexture2D* Tex = nullptr;
        if (!Relative.Contains(TEXT("..")) && FPaths::IsRelative(Relative))
        {
            TArray<uint8> File;
            if (FFileHelper::LoadFileToArray(File, *ArchiveData::File(TEXT("textures/") + Relative)))
                Tex = FImageUtils::ImportBufferAsTexture2D(File);
        }
        if (Tex)
        {
            Tex->AddressX = TA_Wrap;
            Tex->AddressY = TA_Wrap;
            if (FCString::Strcmp(Map, TEXT("normal")) == 0)
            {
                Tex->SRGB = false;
                Tex->UpdateResource();
            }
        }
        else
            UE_LOG(LogTemp, Warning, TEXT("Missing citadel texture %s"), *Relative);
        Images.Add(Relative, Tex);
        return Tex;
    };
    auto* Dark = UMaterialInstanceDynamic::Create(TintParent, this);
    Dark->SetVectorParameterValue(TEXT("Color"), FLinearColor(.06f, .085f, .12f));
    UnlitWindow = Dark;
    TMap<FString, UMaterialInterface*> Materials;
    int32 TextureFinishes = 0;
    for (const auto& Pair : (*Colors)->Values)
    {
        const FLinearColor Color(FColor::FromHex(Pair.Value->AsString()));
        const FJson* Slot = nullptr;
        Slots->TryGetObjectField(Pair.Key, Slot);
        UTexture2D* Albedo = Slot ? Texture(*Slot, TEXT("albedo")) : nullptr;
        auto* MID = UMaterialInstanceDynamic::Create(
            Albedo && StoneParent ? StoneParent.Get() : TintParent.Get(), this);
        if (Albedo && StoneParent)
        {
            MID->SetTextureParameterValue(TEXT("Diffuse"), Albedo);
            MID->SetTextureParameterValue(TEXT("Diffuse2"), Albedo);
            if (UTexture2D* Normal = Texture(*Slot, TEXT("normal")))
            {
                MID->SetTextureParameterValue(TEXT("Normal"), Normal);
                MID->SetTextureParameterValue(TEXT("Normal2"), Normal);
            }
            if (UTexture2D* Emissive = Texture(*Slot, TEXT("emissive")))
            {
                MID->SetTextureParameterValue(TEXT("Emissive"), Emissive);
                MID->SetScalarParameterValue(TEXT("EmissiveMultiply"), 1);
            }
            ++TextureFinishes;
        }
        else
            MID->SetVectorParameterValue(TEXT("Color"), Color);
        Materials.Add(FString(Pair.Key.ToView()), MID);
        Finishes.Add(MID);
    }
    TArray<FBox> ReplacedCrates;
    for (auto& Pair : Batches)
    {
        auto& B = Pair.Value;
        if (!B.TransportCrate)
            continue;
        const FBox Bounds(B.Vertices);
        if (ArchivePropMesh::Place(GetRootComponent(), CrateModel, Bounds))
        {
            B.Visible = false; // The surveyed shell continues to own character and aim traces.
            // The surveyed brass bindings stand 0.9 cm proud of the front and back boards.
            ReplacedCrates.Add(Bounds.ExpandBy(1.0));
        }
    }
    for (auto& Pair : Batches)
    {
        auto& B = Pair.Value;
        if (B.FreightHardware && !ReplacedCrates.IsEmpty())
        {
            // The bake combines the fixed door rail and crate straps under the same district/finish.
            TArray<int32> Kept;
            for (int32 I = 0; I < B.Triangles.Num(); I += 3)
            {
                const int32* Face = B.Triangles.GetData() + I;
                if (!ReplacedCrates.ContainsByPredicate([&](const FBox& Crate) {
                        return Crate.IsInsideOrOn(B.Vertices[Face[0]]) &&
                               Crate.IsInsideOrOn(B.Vertices[Face[1]]) &&
                               Crate.IsInsideOrOn(B.Vertices[Face[2]]);
                    }))
                    Kept.Append(Face, 3);
            }
            B.Triangles = MoveTemp(Kept);
            if (B.Triangles.IsEmpty())
                continue;
        }
        auto* Mesh = NewObject<UProceduralMeshComponent>(this, FName(*Pair.Key));
        AddInstanceComponent(Mesh);
        Mesh->SetupAttachment(GetRootComponent());
        Mesh->SetMobility(B.Animation.IsEmpty() ? EComponentMobility::Static : EComponentMobility::Movable);
        Mesh->bUseComplexAsSimpleCollision = true;
        Mesh->SetCollisionProfileName(TEXT("BlockAll"));
        Mesh->SetCanEverAffectNavigation(false);
        if (!B.Animation.IsEmpty())
            Mesh->SetRelativeTransform(B.Animation[0]);
        Mesh->RegisterComponent();
        Mesh->CreateMeshSection_LinearColor(0, B.Vertices, B.Triangles, B.Normals, B.UV,
                                            TArray<FLinearColor>(), B.Tangents, B.Solid);
        Mesh->SetMaterial(0, Materials[B.Material]);
        Surfaces.Add({Mesh, B.Visible, B.Solid, B.Phase});
        const int32 Window = WindowPhase(B.Material);
        if (Window)
            Windows.Add({Mesh, Materials[B.Material], Window});
        if (!B.Animation.IsEmpty())
            Tracks.Add({Mesh, MoveTemp(B.Animation)});
    }
    for (const auto& Item : *Lamps)
    {
        const FJson* Lamp;
        const FJsonArray* Position;
        TArray<double> P;
        double Range, Intensity;
        if (!Item || !Item->TryGetObject(Lamp) || !(*Lamp)->TryGetArrayField(TEXT("position"), Position) ||
            Position->Num() != 3 || !Numbers(*Position, P) ||
            !(*Lamp)->TryGetNumberField(TEXT("range"), Range) ||
            !(*Lamp)->TryGetNumberField(TEXT("intensity"), Intensity))
            continue;
        auto* Light = NewObject<UPointLightComponent>(this);
        AddInstanceComponent(Light);
        Light->SetupAttachment(GetRootComponent());
        Light->SetRelativeLocation(100 * Axes(P, 0));
        Light->SetLightColor(FLinearColor(1, .76f, .47f));
        Light->SetAttenuationRadius(100 * Range);
        Light->SetIntensity(100 * Intensity);
        Light->SetCastShadows(false);
        Light->RegisterComponent();
    }
    SourceParts = Parts->Num();
    SourceTriangles = TriangleCount;
    SolidParts = SolidCount;
    Duration = Seconds;
    ApplyStoryPhase(0);
    UE_LOG(LogTemp, Display,
           TEXT("Archive citadel: %d surveyed parts, %d solid, %d source triangles, %d batches, %d textured "
                "finishes, %d freight tracks"),
           SourceParts, SolidParts, SourceTriangles, Surfaces.Num(), TextureFinishes, Tracks.Num());
    return true;
}

void AArchiveCitadel::ApplyStoryPhase(int32 Next)
{
    Next = FMath::Clamp(Next, 0, 5);
    if (Next == CurrentPhase)
        return;
    const bool First = CurrentPhase < 0;
    const bool StartLift = CurrentPhase < 4 && Next >= 4;
    CurrentPhase = Next;
    for (const auto& S : Surfaces)
    {
        const bool Shown = Next >= S.Phase;
        S.Mesh->SetVisibility(Shown && S.Visible);
        S.Mesh->SetCollisionEnabled(Shown && S.Solid ? ECollisionEnabled::QueryAndPhysics
                                                     : ECollisionEnabled::NoCollision);
    }
    for (const auto& W : Windows)
        W.Mesh->SetMaterial(0, Next >= W.Phase ? W.Lit : UnlitWindow.Get());
    if (Next < 4 || StartLift)
        Elapsed = First && Next >= 4 ? Duration : 0;
    PositionFreight();
    SetActorTickEnabled(Next >= 4 && Elapsed < Duration && !Tracks.IsEmpty());
}

void AArchiveCitadel::PositionFreight()
{
    for (const auto& Track : Tracks)
    {
        const float Frame = (Duration > 0 ? Elapsed / Duration : 0) * (Track.Keys.Num() - 1);
        const int32 Index = FMath::Clamp(FMath::FloorToInt(Frame), 0, Track.Keys.Num() - 1);
        FTransform T;
        T.Blend(Track.Keys[Index], Track.Keys[FMath::Min(Index + 1, Track.Keys.Num() - 1)], Frame - Index);
        Track.Mesh->SetRelativeTransform(T);
    }
}

void AArchiveCitadel::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);
    Elapsed = FMath::Min(Duration, Elapsed + DeltaSeconds);
    PositionFreight();
    if (Elapsed >= Duration)
        SetActorTickEnabled(false);
}
