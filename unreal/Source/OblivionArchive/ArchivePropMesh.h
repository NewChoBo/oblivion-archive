#pragma once

#include "CoreMinimal.h"

class USceneComponent;
class UStaticMesh;
class UStaticMeshComponent;

namespace ArchivePropMesh
{
// Local vendor packages are optional for source checkouts.
UStaticMesh* Load(const TCHAR* ObjectPath);

// The survey supplies a box in the parent's local Unreal centimetres. Props may have off-centre pivots.
// Alignment is an axis-aligned quarter turn. Collision remains with the surveyed structure.
UStaticMeshComponent* Place(USceneComponent* Parent, UStaticMesh* Mesh, const FBox& LocalBounds,
                            float LocalYaw = 0);
}
