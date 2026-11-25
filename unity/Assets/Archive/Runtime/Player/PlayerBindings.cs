using System;
using System.Collections.Generic;
using UnityEngine;

namespace Archive
{
    public enum PlayerAction
    {
        Forward,
        Back,
        Left,
        Right,
        Sprint,
        Jump,
        Crouch,
        Prone,
        Interact,
        View,
        Shoulder,
        Hand,
        Wand,
        Bow,
        Torch,
        Reload,
        Bag,
        Map,
        Shop,
        Fire
    }

    public sealed class PlayerBindings
    {
        const string Prefix = "archive.controls.v1.";
        static readonly KeyCode[] Defaults = { KeyCode.W,         KeyCode.S,      KeyCode.A,      KeyCode.D,
                                               KeyCode.LeftShift, KeyCode.Space,  KeyCode.C,      KeyCode.Z,
                                               KeyCode.E,         KeyCode.V,      KeyCode.B,      KeyCode.H,
                                               KeyCode.Alpha1,    KeyCode.Alpha2, KeyCode.Alpha3, KeyCode.R,
                                               KeyCode.Tab,       KeyCode.M,      KeyCode.G,      KeyCode.F };
        readonly KeyCode[] keys = (KeyCode[])Defaults.Clone();
        public float Sensitivity { get; private set; }
        public bool LeftHand { get; private set; }
        public int Shoulder { get; private set; }
        public bool Capture { get; private set; }
        public bool Open { get; private set; }
        public bool Listening => rebinding >= 0;
        int rebinding = -1;
        Vector2 scroll;
        GUIStyle button, textStyle;

        public PlayerBindings()
        {
            var seen = new HashSet<KeyCode>();
            for (int i = 0; i < keys.Length; i++)
            {
                KeyCode saved = (KeyCode)PlayerPrefs.GetInt(Prefix + (PlayerAction)i, (int)Defaults[i]);
                if (!Enum.IsDefined(typeof(KeyCode), saved) || Invalid(saved) || !seen.Add(saved))
                {
                    Array.Copy(Defaults, keys, keys.Length);
                    break;
                }
                keys[i] = saved;
            }
            Sensitivity = Mathf.Clamp(PlayerPrefs.GetFloat(Prefix + "sensitivity", 1), 0.25f, 3f);
            LeftHand = PlayerPrefs.GetInt(Prefix + "left", 0) == 1;
            Shoulder = Mathf.Clamp(PlayerPrefs.GetInt(Prefix + "shoulder", 1), -1, 1);
            Capture = PlayerPrefs.GetInt(Prefix + "capture", 1) == 1;
        }
        static bool Invalid(KeyCode k) => k == KeyCode.None || k == KeyCode.Escape || k == KeyCode.Return
                                          || k == KeyCode.KeypadEnter || k == KeyCode.LeftArrow
                                          || k == KeyCode.RightArrow || k == KeyCode.UpArrow
                                          || k == KeyCode.DownArrow || k >= KeyCode.Mouse0;
        public KeyCode Key(PlayerAction action) => keys[(int)action];
        public bool Down(PlayerAction a) => Input.GetKeyDown(Key(a));
        public bool Held(PlayerAction a) => Input.GetKey(Key(a)) ||
                                            (Key(a) == KeyCode.LeftShift &&
                                             Array.IndexOf(keys, KeyCode.RightShift) < 0 &&
                                             Input.GetKey(KeyCode.RightShift));
        public bool BagPressed =>
            Down(PlayerAction.Bag) || (Array.IndexOf(keys, KeyCode.I) < 0 && Input.GetKeyDown(KeyCode.I));
        public void FlipHand()
        {
            LeftHand = !LeftHand;
            PlayerPrefs.SetInt(Prefix + "left", LeftHand ? 1 : 0);
        }
        public void CycleShoulder()
        {
            Shoulder = Shoulder == 1 ? -1 : Shoulder + 1;
            PlayerPrefs.SetInt(Prefix + "shoulder", Shoulder);
        }
        public void Show()
        {
            Open = true;
            rebinding = -1;
            scroll = Vector2.zero;
        }
        public void Close()
        {
            Open = false;
            rebinding = -1;
            PlayerPrefs.Save();
        }

        static string Display(KeyCode key)
        {
            if (key >= KeyCode.Alpha0 && key <= KeyCode.Alpha9)
                return ((int)key - (int)KeyCode.Alpha0).ToString();
            return key == KeyCode.LeftShift ? "Shift" : key.ToString();
        }
        public string Label(PlayerAction a) => Display(Key(a));

        internal void Draw(ChapterText txt)
        {
            if (button == null)
            {
                Font font = Resources.Load<Font>("ArchiveHudFont");
                button = new GUIStyle(GUI.skin.button) { font = font, fontSize = 17 };
                textStyle = new GUIStyle(GUI.skin.label) { font = font, fontSize = 17, wordWrap = true };
            }
            Event ev = Event.current;
            if (rebinding >= 0 && ev.type == EventType.KeyDown && ev.keyCode != KeyCode.None)
            {
                if (ev.keyCode == KeyCode.Escape)
                    rebinding = -1;
                else if (!Invalid(ev.keyCode))
                {
                    int collision = Array.IndexOf(keys, ev.keyCode);
                    if (collision >= 0 && collision != rebinding)
                    {
                        keys[collision] = keys[rebinding];
                        PlayerPrefs.SetInt(Prefix + (PlayerAction)collision, (int)keys[collision]);
                    }
                    keys[rebinding] = ev.keyCode;
                    PlayerPrefs.SetInt(Prefix + (PlayerAction)rebinding, (int)ev.keyCode);
                    rebinding = -1;
                }
                ev.Use();
            }
            var matrix = GUI.matrix;
            float scale = Mathf.Clamp(Mathf.Min(Screen.width / 740f, Screen.height / 510f), .67f, 1.35f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));
            float w = Screen.width / scale, h = Screen.height / scale, panel = Mathf.Min(w - 20, 510),
                  panelH = Mathf.Min(h - 20, 500);
            GUI.Box(new Rect((w - panel) / 2, (h - panelH) / 2, panel, panelH), "");
            GUILayout.BeginArea(new Rect((w - panel) / 2 + 14, (h - panelH) / 2 + 12, panel - 28, panelH - 24));
            GUILayout.Label(txt["controls.settings"], textStyle);
            scroll = GUILayout.BeginScrollView(scroll);
            if (GUILayout.Button(txt["controls.language"] + "  ·  " + txt.OtherLanguage, button))
                txt.Toggle();
            GUILayout.Label(txt["controls.sensitivity"] + "  " + Sensitivity.ToString("0.00"), textStyle);
            float next = GUILayout.HorizontalSlider(Sensitivity, 0.25f, 3f);
            if (Mathf.Abs(next - Sensitivity) > .001f)
            {
                Sensitivity = next;
                PlayerPrefs.SetFloat(Prefix + "sensitivity", next);
            }
            if (GUILayout.Button(txt["controls.capture"] + "  " + txt[Capture ? "controls.on" : "controls.off"],
                                 button))
            {
                Capture = !Capture;
                PlayerPrefs.SetInt(Prefix + "capture", Capture ? 1 : 0);
            }
            if (GUILayout.Button(
                    txt["controls.hand"] + "  " + txt[LeftHand ? "controls.left" : "controls.right"], button))
                FlipHand();
            if (GUILayout.Button(txt["controls.shoulder"] + "  " +
                                     txt[Shoulder < 0   ? "controls.left"
                                         : Shoulder > 0 ? "controls.right"
                                                        : "controls.center"],
                                 button))
                CycleShoulder();
            for (int i = 0; i < keys.Length; i++)
            {
                GUILayout.BeginHorizontal();
                GUILayout.Label(txt["bind." + ((PlayerAction)i).ToString().ToLowerInvariant()], textStyle);
                if (GUILayout.Button(i == rebinding ? "…" : Display(keys[i]), button, GUILayout.Width(112)))
                    rebinding = i;
                GUILayout.EndHorizontal();
            }
            if (GUILayout.Button(txt["controls.reset"], button))
            {
                for (int i = 0; i < keys.Length; i++)
                {
                    keys[i] = Defaults[i];
                    PlayerPrefs.DeleteKey(Prefix + (PlayerAction)i);
                }
                Sensitivity = 1;
                LeftHand = false;
                Shoulder = 1;
                Capture = true;
                foreach (string k in new[] { "sensitivity", "left", "shoulder", "capture" })
                    PlayerPrefs.DeleteKey(Prefix + k);
                rebinding = -1;
            }
            GUILayout.EndScrollView();
            if (GUILayout.Button(txt["controls.close"], button))
                Close();
            GUILayout.EndArea();
            GUI.matrix = matrix;
        }
    }
}
