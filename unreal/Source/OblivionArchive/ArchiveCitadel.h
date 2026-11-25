#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "ArchiveCitadel.generated.h"

class UMaterialInstanceDynamic;
class UMaterialInterface;
class UProceduralMeshComponent;

UCLASS()
class OBLIVIONARCHIVE_API AArchiveCitadel : public AActor
{
    GENERATED_BODY()
public:
    AArchiveCitadel();
    bool LoadBake(const FString& Path);
    void ApplyStoryPhase(int32 Phase);
    void Tick(float DeltaSeconds) override;
    int32 GetSourcePartCount() const
    {
        return SourceParts;
    }
    int32 GetSolidPartCount() const
    {
        return SolidParts;
    }
    int32 GetTriangleCount() const
    {
        return SourceTriangles;
    }

private:
    struct FSurface
    {
        UProceduralMeshComponent* Mesh = nullptr;
        bool Visible = false, Solid = false;
        int32 Phase = 0;
    };
    struct FWindow
    {
        UProceduralMeshComponent* Mesh = nullptr;
        UMaterialInterface* Lit = nullptr;
        int32 Phase = 0;
    };
    struct FFreightTrack
    {
        UProceduralMeshComponent* Mesh = nullptr;
        TArray<FTransform> Keys;
    };

    UPROPERTY()
    TObjectPtr<UMaterialInterface> StoneParent;
    UPROPERTY()
    TObjectPtr<UMaterialInterface> TintParent;
    UPROPERTY()
    TObjectPtr<UMaterialInterface> UnlitWindow;
    UPROPERTY()
    TArray<TObjectPtr<UMaterialInterface>> Finishes;
    TArray<FSurface> Surfaces;
    TArray<FWindow> Windows;
    TArray<FFreightTrack> Tracks;
    int32 SourceParts = 0, SolidParts = 0, SourceTriangles = 0, CurrentPhase = -1;
    float Duration = 0, Elapsed = 0;
    void PositionFreight();
};
