#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "GameFramework/GameModeBase.h"
#include "GameFramework/HUD.h"
#include "ArchivePlayer.generated.h"

class AArchiveChapter;
class UCameraComponent;

UCLASS()
class AArchiveCharacter final : public ACharacter
{
    GENERATED_BODY()
public:
    AArchiveCharacter();
    virtual void SetupPlayerInputComponent(UInputComponent* Input) override;
    virtual void Tick(float DeltaSeconds) override;
    AArchiveChapter* Chapter() const;
    UCameraComponent* Eyes() const
    {
        return Camera;
    }

private:
    UPROPERTY(VisibleAnywhere)
    TObjectPtr<UCameraComponent> Camera;
    void Forward(float Value);
    void Right(float Value);
    void Yaw(float Value);
    void Pitch(float Value);
    void StartJump();
    void Sprint();
    void Walk();
    void Interact();
    void Confirm();
    void NewChapter();
    void Pause();
};

UCLASS()
class AArchiveHUD final : public AHUD
{
    GENERATED_BODY()
public:
    virtual void DrawHUD() override;
};

UCLASS()
class AArchiveGameMode final : public AGameModeBase
{
    GENERATED_BODY()
public:
    AArchiveGameMode();
    virtual void StartPlay() override;
    virtual void HandleStartingNewPlayer_Implementation(APlayerController* NewPlayer) override;
    UPROPERTY()
    TObjectPtr<AArchiveChapter> Chapter;
};
