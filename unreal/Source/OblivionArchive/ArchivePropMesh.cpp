#include "ArchivePropMesh.h"
#include "Components/StaticMeshComponent.h"
#include "Engine/StaticMesh.h"
#include "GameFramework/Actor.h"
#include "Misc/PackageName.h"

UStaticMesh* ArchivePropMesh::Load(const TCHAR* ObjectPath)
{
    if (!FPackageName::DoesPackageExist(FPackageName::ObjectPathToPackageName(FString(ObjectPath))))
        return nullptr;
    return LoadObject<UStaticMesh>(nullptr, ObjectPath);
}

UStaticMeshComponent* ArchivePropMesh::Place(USceneComponent* Parent, UStaticMesh* Mesh,
                                             const FBox& LocalBounds, float LocalYaw)
{
    if (!Mesh || !Parent || !LocalBounds.IsValid)
        return nullptr;
    const FQuat Rotation(FVector::UpVector, FMath::DegreesToRadians(static_cast<double>(LocalYaw)));
    const FBox Source = Mesh->GetBoundingBox();
    if (Source.GetSize().GetMin() <= UE_SMALL_NUMBER)
        return nullptr;
    const FVector Scale = Rotation.UnrotateVector(LocalBounds.GetSize()).GetAbs() / Source.GetSize();
    const FVector Offset = LocalBounds.GetCenter() - Rotation.RotateVector(Source.GetCenter() * Scale);
    AActor* Owner = Parent->GetOwner();
    auto* Surface = NewObject<UStaticMeshComponent>(Owner);
    Owner->AddInstanceComponent(Surface);
    Surface->SetMobility(Parent->Mobility);
    Surface->SetupAttachment(Parent);
    Surface->SetStaticMesh(Mesh);
    Surface->SetRelativeTransform(FTransform(Rotation, Offset, Scale));
    Surface->SetCollisionProfileName(TEXT("NoCollision"));
    Surface->SetGenerateOverlapEvents(false);
    Surface->SetCanEverAffectNavigation(false);
    Surface->RegisterComponent();
    return Surface;
}
