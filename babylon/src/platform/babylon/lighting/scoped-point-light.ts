import { Node, PointLight, type AbstractMesh } from '@babylonjs/core';

// The Babylon inclusion list uses push/splice hooks that revisit the whole scene.
// Update its contents together and notify only meshes whose membership changed.
export class ScopedPointLight extends PointLight {
  private receiversEnabled = true;

  override setEnabled(value: boolean) {
    // Node maintains the flag, descendants and observers. Light adds two scene-wide
    // scans to this path. The scoped hook below handles both direct and inherited changes.
    Node.prototype.setEnabled.call(this, value);
  }

  protected override _syncParentEnabledState() {
    Node.prototype['_syncParentEnabledState'].call(this);
    const enabled = this.isEnabled();
    if (this.receiversEnabled === enabled || this.isDisposed()) return;
    this.receiversEnabled = enabled;
    if (this._clusteredContainer) return;
    const included = this.includedOnlyMeshes;
    for (const mesh of included.length ? included : this.getScene().meshes) {
      mesh._resyncLightSource(this);
      if (enabled) this.orderLight(mesh);
    }
  }

  private orderLight(mesh: AbstractMesh) {
    // Babylon appends reactivated lights. Restore priority when a torch enters
    // a mesh that already has a lower-priority projectile light attached.
    const sources = mesh.lightSources;
    const index = sources.indexOf(this);
    if (index < 1) return;
    const before = sources.findIndex((light) => light.renderPriority < this.renderPriority);
    if (before < 0 || before >= index) return;
    sources.splice(index, 1);
    sources.splice(before, 0, this);
  }

  setReceivers(next: AbstractMesh[]) {
    const current = this.includedOnlyMeshes;
    if (current.length === next.length && next.every((mesh, i) => mesh === current[i])) return;
    const active = this.isEnabled() && !this._clusteredContainer;
    if (active && (!current.length || !next.length)) {
      // An empty Babylon list means unrestricted illumination.
      this.includedOnlyMeshes = next;
      return;
    }
    const removed = active ? new Set(current) : undefined;
    const added = removed && next.filter((mesh) => !removed.delete(mesh));
    if (removed?.size === 0 && added?.length === 0) return;
    current.length = next.length;
    for (let i = 0; i < next.length; i++) current[i] = next[i]!;
    if (!removed || !added) return;
    for (const mesh of removed) mesh._resyncLightSource(this);
    for (const mesh of added) {
      mesh._resyncLightSource(this);
      this.orderLight(mesh);
    }
  }
}
