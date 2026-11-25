using UnityEngine;

namespace Archive
{
    public struct ArchiveHit
    {
        public Collider Collider;
        public string Weapon;
        public Vector3 Point, Direction;
        public int Damage;
        public bool Headshot;
    }

    public interface IArchiveDamageable
    {
        void ReceiveHit(ArchiveHit hit);
    }

    public sealed class ArchiveHitZone : MonoBehaviour
    {
        public bool head;
    }
}
