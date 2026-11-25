using UnityEngine;

namespace Archive
{
    public sealed partial class ChapterStory
    {
        Font font;
        GUIStyle caption, barButton, heading;
        readonly Color shade = new(.035f, .048f, .064f, .95f);

        void PrepareStyles()
        {
            if (caption != null) return;
            font = Resources.Load<Font>("ArchiveHudFont");
            caption = new GUIStyle(GUI.skin.label) {
                font = font, alignment = TextAnchor.MiddleCenter, wordWrap = true, richText = false,
                padding = new RectOffset(8, 8, 4, 4)
            };
            caption.normal.textColor = new Color(.94f, .90f, .81f);
            heading = new GUIStyle(caption) { fontStyle = FontStyle.Bold };
            barButton = new GUIStyle(GUI.skin.button) { font = font, wordWrap = true };
        }

        static void Fill(Rect bounds, Color color)
        {
            Color previous = GUI.color;
            GUI.color = color; GUI.DrawTexture(bounds, Texture2D.whiteTexture); GUI.color = previous;
        }

        public void DrawOverlay()
        {
            if (Mode == "play") return;
            PrepareStyles();
            float w = Screen.width, h = Screen.height;
            float baseline = Mathf.Clamp(Mathf.Min(w / 28, h / 20), 13, 28);
            caption.fontSize = Mathf.RoundToInt(baseline);
            heading.fontSize = Mathf.RoundToInt(Mathf.Min(baseline * 1.22f, 32));
            barButton.fontSize = Mathf.RoundToInt(Mathf.Max(12, baseline * .79f));
            var full = new Rect(0, 0, w, h);
            Fill(full, new Color(.018f, .025f, .035f, 1));
            bool intro = Mode == "prologue";
            Texture art = intro ? page < 4 ? nightArt : erasureArt : Mode == "ending" ? restoredArt : null;
            if (art) GUI.DrawTexture(full, art, ScaleMode.ScaleAndCrop);
            if (!intro && Mode != "ending") Fill(full, new Color(.045f, .025f, .058f));
            float margin = Mathf.Clamp(w * .045f, 8, 58);
            float bottom = Mathf.Clamp(h * .34f, 126, 220), y = h - bottom;
            Fill(new Rect(0, y, w, bottom), shade);
            float row = Mathf.Clamp(h * .085f, 32, 46), foot = h - row - 9;
            float textWidth = Mathf.Min(w - margin * 2, 1000), x = (w - textWidth) / 2;
            if (intro)
            {
                GUI.Label(new Rect(x, y + 2, textWidth, foot - y - 6), Text("prologue." + Pages[page]), caption);
                float gap = 6, each = (textWidth - gap * 2) / 3;
                if (page + 1 == Pages.Length)
                {
                    if (GUI.Button(new Rect((w - each) / 2, foot, each, row), Text("prologue.enter"), barButton))
                        FinishPrologue();
                    return;
                }
                if (GUI.Button(new Rect(x, foot, each, row), Text("skip"), barButton)) FinishPrologue();
                if (GUI.Button(new Rect(x + each + gap, foot, each, row), Text("prologue." + (autoAdvance ? "pause" : "play")), barButton))
                    autoAdvance = !autoAdvance;
                if (GUI.Button(new Rect(x + (each + gap) * 2, foot, each, row), Text("prologue.next"), barButton))
                    NextPage();
                return;
            }
            bool dead = Mode == "dead";
            float labelHeight = Mathf.Clamp(bottom * .31f, 32, 55);
            GUI.Label(new Rect(x, y + 1, textWidth, labelHeight),
                Text(dead ? fallen ? "fallen" : "dead" : "ending"), heading);
            GUI.Label(new Rect(x, y + labelHeight, textWidth, foot - y - labelHeight),
                dead ? Objective : Text("event.name-restored"), caption);
            float buttonWidth = Mathf.Min(textWidth * .48f, 270);
            if (dead && GUI.Button(new Rect(w / 2 - buttonWidth - 4, foot, buttonWidth, row), Text("retry"), barButton))
                RetryRequested?.Invoke();
            if (GUI.Button(new Rect(dead ? w / 2 + 4 : (w - buttonWidth) / 2, foot, buttonWidth, row), Text("title"), barButton))
                ReturnToTitleRequested?.Invoke();
        }
    }
}
