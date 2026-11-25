using UnityEngine;

namespace Archive
{
    public sealed class ExpeditionFoe : MonoBehaviour
    {
        public int index;
        public Collider head;
        public Transform visual;
        public Vector3 spawn;
        float stun, windup, recovery, elapsed;
        Vector3 rest;
        bool hasRest;
        public void ResetAtSpawn() {
            transform.localPosition = spawn;
            stun = windup = recovery = elapsed = 0;
            if (visual) {
                if (!hasRest) { rest = visual.localPosition; hasRest = true; }
                visual.localPosition = rest;
            }
        }
        public void Stun() { stun = 0.7f; windup = 0; recovery = 0.35f; }

        bool Step(Vector3 direction, float distance, Transform target)
        {
            var ray = new Ray(transform.position + Vector3.up * 0.55f, direction);
            if (Physics.SphereCast(ray, 0.24f, out var blocker, distance + 0.08f,
                Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore) &&
                !blocker.transform.IsChildOf(transform) && !blocker.transform.IsChildOf(target)) return false;
            transform.position += direction * distance;
            return true;
        }
        public bool Advance(Transform target, bool safe, float dt)
        {
            elapsed += dt;
            if (visual) visual.localPosition = rest + Vector3.up * (0.045f * Mathf.Sin(elapsed * 3 + index));
            stun = Mathf.Max(0, stun - dt); recovery = Mathf.Max(0, recovery - dt);
            if (safe || stun > 0) { windup = 0; return false; }
            var delta = target.position - transform.position; delta.y = 0;
            float distance = delta.magnitude;
            if (distance > 8 || distance < 0.01f) { windup = 0; return false; }
            var direction = delta / distance;
            transform.rotation = Quaternion.LookRotation(direction);
            var origin = transform.position + Vector3.up * 0.68f;
            var aim = target.position + Vector3.up * 0.65f - origin;
            bool clear = !Physics.Raycast(origin, aim.normalized, out var obstacle, aim.magnitude,
                Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore) || obstacle.transform.IsChildOf(target);
            if (!clear || distance > 1.2f) {
                windup = 0;
                if (!Step(direction, 1.22f * dt, target)) {
                    var turn = Quaternion.Euler(0, index % 2 == 0 ? 66 : -66, 0) * direction;
                    if (!Step(turn, dt, target)) Step(Quaternion.Euler(0, 180, 0) * turn, dt, target);
                }
                return false;
            }
            if (recovery > 0) return false;
            windup += dt;
            if (windup < 0.55f) return false;
            windup = 0; recovery = 1.45f;
            return true;
        }
    }
}
