using UnityEngine;

namespace Archive
{
    public sealed class StoryTarget : MonoBehaviour
    {
        public string id;
        public int phase;
        public Vector3 approach;
        public float range;
        public GameObject[] glyphs;

        public void DisplayGlyph(int index)
        {
            if (glyphs == null) return;
            for (int i = 0; i < glyphs.Length; i++) glyphs[i].SetActive(index == i);
        }
    }
}
