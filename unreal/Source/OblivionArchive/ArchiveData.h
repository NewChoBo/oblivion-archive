#pragma once

#include "CoreMinimal.h"
#include "Dom/JsonObject.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

namespace ArchiveData
{
inline FString File(const FString& Name)
{
    return FPaths::ProjectContentDir() / TEXT("ArchiveData") / Name;
}
inline TSharedPtr<FJsonObject> Read(const FString& Name)
{
    FString Raw;
    TSharedPtr<FJsonObject> Json;
    if (!FFileHelper::LoadFileToString(Raw, *File(Name)) ||
        !FJsonSerializer::Deserialize(TJsonReaderFactory<>::Create(Raw), Json) || !Json.IsValid())
    {
        UE_LOG(LogTemp, Error, TEXT("Could not read chapter data %s"), *File(Name));
        return nullptr;
    }
    return Json;
}
inline FString String(const TSharedPtr<FJsonObject>& O, const TCHAR* Key, const FString& Fallback = {})
{
    FString Value;
    return O.IsValid() && O->TryGetStringField(Key, Value) ? Value : Fallback;
}
inline bool Flag(const TSharedPtr<FJsonObject>& O, const TCHAR* Key)
{
    bool Value = false;
    return O && O->TryGetBoolField(Key, Value) && Value;
}
inline FVector Vec(const TSharedPtr<FJsonObject>& O, const TCHAR* Key, FVector Fallback = FVector::ZeroVector)
{
    const TArray<TSharedPtr<FJsonValue>>* A = nullptr;
    return O->TryGetArrayField(Key, A) && A->Num() == 3
               ? FVector((*A)[0]->AsNumber(), (*A)[1]->AsNumber(), (*A)[2]->AsNumber())
               : Fallback;
}
} // namespace ArchiveData
