#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Actor.h"
#include "GameFramework/SaveGame.h"
#include "ArchiveChapter.generated.h"

class AArchiveCharacter;
class AArchiveCitadel;
class UMaterialInterface;
class UMaterialInstanceDynamic;
class UStaticMesh;
class UStaticMeshComponent;
class UTexture2D;

UCLASS()
class UArchiveCheckpoint final : public USaveGame
{
    GENERATED_BODY()
public:
    UPROPERTY(SaveGame)
    int32 Version = 1;
    UPROPERTY(SaveGame)
    int32 Phase = 0;
    UPROPERTY(SaveGame)
    TArray<int32> Runes = {2, 2, 2};
    UPROPERTY(SaveGame)
    bool Clue = false;
};

enum class EArchiveScreen : uint8
{
    Title,
    Play,
    Paused,
    Defeated,
    Ending
};

UCLASS()
class AArchiveChapter final : public AActor
{
    GENERATED_BODY()
public:
    AArchiveChapter();
    bool Build();
    void NewChapter(AArchiveCharacter& Player);
    void Continue(AArchiveCharacter& Player);
    void Retry(AArchiveCharacter& Player);
    void AdvanceMenu(AArchiveCharacter& Player);
    void Pause();
    void Fall();
    FString AimId(const AArchiveCharacter& Player) const;
    FString Prompt(const FString& Id) const;
    bool Interact(AArchiveCharacter& Player);
    virtual void Tick(float DeltaSeconds) override;
    FString Text(const FString& Key) const;
    FString Objective() const;
    int32 GetPhase() const
    {
        return Phase;
    }
    bool HasSave() const
    {
        return Saved != nullptr;
    }
    bool HasClue() const
    {
        return bClue;
    }
    const TArray<int32>& GetRunes() const
    {
        return Runes;
    }
    EArchiveScreen Screen = EArchiveScreen::Title;
    FString Subtitle;
    UPROPERTY()
    TObjectPtr<UTexture2D> Faded;
    UPROPERTY()
    TObjectPtr<UTexture2D> Restored;
    UPrimitiveComponent* FindPart(FName Id) const;
    void SetCastle(AArchiveCitadel* InCastle);
    AArchiveCitadel* GetCastle() const
    {
        return Castle.Get();
    }

private:
    friend class FArchiveConstruction;
    bool Allowed(const FString& Id) const;
    void SaveProgress();
    void ResetPlayer(AArchiveCharacter& Player);
    void Refresh(bool Immediate);
    void Say(const FString& Value);
    bool ValidSave(const UArchiveCheckpoint* Record) const;
    TMap<FString, FString> English, Local;
    TMap<FName, TWeakObjectPtr<UPrimitiveComponent>> Parts;
    TMap<TWeakObjectPtr<UPrimitiveComponent>, FString> Targets;
    TMap<FString, FVector> Approaches;
    TMap<FString, float> Ranges;
    TArray<TWeakObjectPtr<USceneComponent>> Doors;
    TArray<FVector> DoorOrigins;
    TArray<TArray<TWeakObjectPtr<USceneComponent>>> Glyphs;
    TArray<FString> Lines;
    float LineTime = 0;
    UPROPERTY()
    TObjectPtr<UArchiveCheckpoint> Saved;
    UPROPERTY()
    TObjectPtr<UMaterialInstanceDynamic> PhotoMaterial;
    UPROPERTY()
    TObjectPtr<AArchiveCitadel> Castle;
    FString Slot;
    int32 Phase = 0;
    TArray<int32> Runes = {2, 2, 2};
    bool bClue = false;
};
