using System;
using UnityEngine;

namespace Archive.World
{
    // A pose is a world-space TRS sampled from the same freight sequence as the survey.
    [Serializable]
    public struct FreightPose
    {
        public Vector3 position, scale;
        public Quaternion rotation;
    }
    [Serializable]
    public class FreightTrack
    {
        public Transform part;
        public FreightPose[] keys;
        public void Apply(float fraction)
        {
            float frame = fraction * (keys.Length - 1);
            int i = Mathf.FloorToInt(frame);
            var a = keys[i];
            var b = keys[Mathf.Min(i + 1, keys.Length - 1)];
            part.localPosition = Vector3.Lerp(a.position, b.position, frame - i);
            part.localRotation = Quaternion.Slerp(a.rotation, b.rotation, frame - i);
            part.localScale = Vector3.Lerp(a.scale, b.scale, frame - i);
        }
    }
    [Serializable]
    public class RestorationPart
    {
        public GameObject target;
        public int phase;
    }
    [Serializable]
    public class RestorationWindow
    {
        public Renderer target;
        public int phase;
        public Color tint;
    }
    public sealed class CitadelRestoration : MonoBehaviour
    {
        public float duration;
        public Vector3 lookout;
        public RestorationPart[] reveals;
        public RestorationWindow[] windows;
        public FreightTrack[] freight;
        ChapterStory story;
        ChapterPlayer player;
        int phase = -1;
        float elapsed;
        void Start()
        {
            story = FindAnyObjectByType<ChapterStory>();
            player = FindAnyObjectByType<ChapterPlayer>();
            SetPhase(story ? story.Phase : 0, true);
        }
        void Update()
        {
            if (!story)
                return;
            if (story.Phase != phase)
                SetPhase(story.Phase, false);
            if (phase < 4 || elapsed >= duration || !player || !player.CanAct)
                return;
            elapsed = Mathf.Min(duration, elapsed + Time.deltaTime);
            foreach (var track in freight)
                track.Apply(elapsed / duration);
        }
        void SetPhase(int next, bool immediate)
        {
            if (next < 4 || phase < 4)
                elapsed = immediate && next >= 4 ? duration : 0;
            phase = next;
            foreach (var part in reveals)
                part.target.SetActive(phase >= part.phase);
            var block = new MaterialPropertyBlock();
            foreach (var window in windows)
            {
                bool lit = phase >= window.phase;
                block.SetColor("_Color", lit ? window.tint : new Color(.19f, .24f, .29f));
                block.SetColor("_EmissionColor",
                               lit ? new Color(.85f, .46f, .16f) : new Color(.015f, .023f, .032f));
                window.target.SetPropertyBlock(block);
            }
            foreach (var track in freight)
                track.Apply(elapsed / duration);
        }
    }
}
