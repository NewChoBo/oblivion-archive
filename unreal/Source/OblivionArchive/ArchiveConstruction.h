#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"

class AArchiveChapter;
class UMaterialInterface;
class UStaticMesh;
class UPrimitiveComponent;
class USceneComponent;

class FArchiveConstruction
{
public:
    explicit FArchiveConstruction(AArchiveChapter& InChapter) : Chapter(InChapter) {}
    bool Build();
    static FVector Cm(double X, double Y, double Z)
    {
        return FVector(Z * 100, X * 100, Y * 100);
    }
    static FVector Cm(const FVector& P)
    {
        return Cm(P.X, P.Y, P.Z);
    }

private:
    AArchiveChapter& Chapter;
    TSharedPtr<FJsonObject> Plan, Catalog;
    TMap<FString, UMaterialInterface*> Materials;
    FString MasonryFinish = TEXT("stone");
    UStaticMesh* Cube = nullptr;
    UStaticMesh* FolioShelf = nullptr;
    UMaterialInterface* BaseMaterial = nullptr;
    double PlinthShift = 0;
    UMaterialInterface* Material(const FString& Name, const FColor& Color);
    USceneComponent* Group(const FString& Id, USceneComponent* Parent, FVector Local, float Yaw = 0);
    UPrimitiveComponent* Box(const FString& Id, USceneComponent* Parent, FVector Center, FVector Size,
                             const FString& Finish, bool Solid);
    void Place(const TSharedPtr<FJsonObject>& Row);
    void Wall(const TSharedPtr<FJsonObject>& Row, USceneComponent* Root, const FString& Finish);
    void Furnish();
    void Tag(UPrimitiveComponent* Surface, const FString& Id, FVector At, float Range);
    USceneComponent* Glyph(USceneComponent* Parent, int32 Symbol, float Scale);
    TMap<FString, USceneComponent*> Instances;
};
