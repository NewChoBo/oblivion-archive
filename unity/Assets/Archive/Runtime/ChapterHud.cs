using UnityEngine;

namespace Archive
{
    // The chapter HUD is drawn in reference pixels, with the objective and subtitles
    // independently wrapped to the available viewport.
    internal sealed class ChapterHud
    {
        private static readonly Color Ink = new Color(0.025f, 0.043f, 0.057f, 0.91f);
        private static readonly Color Gold = new Color(0.86f, 0.69f, 0.41f);
        private static readonly Color Paper = new Color(0.96f, 0.93f, 0.85f);
        private GUIStyle heading, caption, body, center, button;

        private void Prepare()
        {
            if (body != null)
                return;
            body = Label(19, Paper);
            heading = Label(30, Paper, FontStyle.Bold);
            caption = Label(14, Gold, FontStyle.Bold);
            center = Label(20, Paper);
            center.alignment = TextAnchor.MiddleCenter;
            button = new GUIStyle(GUI.skin.button) { fontSize = 18, fontStyle = FontStyle.Bold };
            var font = Resources.Load<Font>("ArchiveHudFont");
            if (font != null)
                heading.font = caption.font = body.font = center.font = button.font = font;
        }

        private static GUIStyle Label(int size, Color color, FontStyle style = FontStyle.Normal)
        {
            var label = new GUIStyle(GUI.skin.label) { fontSize = size, fontStyle = style, wordWrap = true,
                                                       padding = new RectOffset(0, 0, 0, 0) };
            label.normal.textColor = color;
            return label;
        }

        private static void Fill(Rect rect, Color color)
        {
            Color original = GUI.color;
            GUI.color = color;
            GUI.DrawTexture(rect, Texture2D.whiteTexture);
            GUI.color = original;
        }

        private Vector2 Scale()
        {
            Prepare();
            float scale = Mathf.Clamp(Mathf.Min(Screen.width / 880f, Screen.height / 500f), 0.65f, 1.35f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));
            return new Vector2(Screen.width / scale, Screen.height / scale);
        }

        private static float TextHeight(GUIStyle style, string text, float width)
        {
            return Mathf.Ceil(style.CalcHeight(new GUIContent(text), width));
        }

        Vector2 menuScroll;
        public string Menu(ChapterText text, PlayerBindings keys, bool title, bool saved, bool chapter)
        {
            var matrix = GUI.matrix;
            Vector2 view = Scale();
            float width = Mathf.Min(540, view.x - 24), height = Mathf.Min(title ? 368 : 290, view.y - 16);
            Rect rect = new Rect((view.x - width) * .5f, (view.y - height) * .5f, width, height);
            Fill(new Rect(0, 0, view.x, view.y), new Color(.02f, .03f, .04f, .42f));
            Fill(rect, Ink);
            Fill(new Rect(rect.x, rect.y, rect.width, 3), Gold);
            GUILayout.BeginArea(new Rect(rect.x + 20, rect.y + 16, width - 40, height - 32));
            menuScroll = GUILayout.BeginScrollView(menuScroll);
            GUILayout.Label(text["chapter.brand"], caption);
            GUILayout.Label(text[title ? "chapter.title" : "menu.paused"], heading);
            GUILayout.Space(5);
            string movement = keys.Label(PlayerAction.Forward) + " " + keys.Label(PlayerAction.Left) + " " +
                              keys.Label(PlayerAction.Back) + " " + keys.Label(PlayerAction.Right);
            GUILayout.Label(string.Format(text["menu.controls"], movement, keys.Label(PlayerAction.Sprint),
                                          keys.Label(PlayerAction.Jump), keys.Label(PlayerAction.Interact),
                                          keys.Label(PlayerAction.Fire), keys.Label(PlayerAction.Bag)),
                            body);
            GUILayout.Space(10);
            string action = null;
            void Choice(string id, string key, bool defaultAction = false)
            {
                if (GUILayout.Button(text[key] + (defaultAction ? "   [Enter]" : ""), button,
                                     GUILayout.MinHeight(34)))
                    action = id;
            }
            GUILayout.BeginHorizontal();
            if (title)
            {
                if (saved)
                    Choice("continue", "menu.continue", true);
                Choice("begin", "menu.begin", !saved);
            }
            else
                Choice("resume", "menu.resume");
            if (title)
                Choice("arena", "menu.arena");
            else if (chapter)
                Choice("retry", "menu.retry");
            GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();
            Choice("settings", "controls.settings");
            if (GUILayout.Button(text.OtherLanguage, button, GUILayout.MinHeight(34)))
                text.Toggle();
            if (!title)
                Choice("title", "menu.title");
            GUILayout.EndHorizontal();
            GUILayout.EndScrollView();
            GUILayout.EndArea();
            GUI.matrix = matrix;
            return action;
        }

        public bool Death(ChapterText text)
        {
            var matrix = GUI.matrix;
            var view = Scale();
            float w = Mathf.Min(400, view.x - 20);
            Rect rect = new Rect((view.x - w) / 2, (view.y - 130) / 2, w, 130);
            Fill(rect, Ink);
            GUI.Label(new Rect(rect.x + 12, rect.y + 15, w - 24, 45), text["player.dead"], heading);
            bool retry = GUI.Button(new Rect(rect.x + 12, rect.y + 68, w - 24, 45), text["menu.retry"], button);
            GUI.matrix = matrix;
            return retry;
        }

        public void Play(string chapter, string objective, string prompt, string subtitle, string gear,
                         string stock, float draw, string health, bool hit, bool headshot)
        {
            var matrix = GUI.matrix;
            Vector2 view = Scale();
            float width = Mathf.Min(385, view.x * .68f);
            if (!string.IsNullOrEmpty(objective))
            {
                float height = TextHeight(body, objective, width - 28);
                Fill(new Rect(16, 16, width, height + 42), Ink);
                Fill(new Rect(16, 16, 3, height + 42), Gold);
                GUI.Label(new Rect(30, 24, width - 28, 18), chapter, caption);
                GUI.Label(new Rect(30, 46, width - 28, height), objective, body);
            }
            if (gear != null)
            {
                var box = new Rect(view.x - 150, view.y - 59, 137, 46);
                Fill(box, Ink);
                GUI.Label(new Rect(box.x + 8, box.y + 3, 130, 19), gear, caption);
                GUI.Label(new Rect(box.x + 8, box.y + 18, 130, 24), stock, body);
                if (draw > 0)
                    Fill(new Rect(box.x, box.y - 4, box.width * draw, 4), Gold);
            }
            if (health != null)
            {
                var box = new Rect(13, view.y - 50, Mathf.Min(250, view.x - 180), 36);
                Fill(box, Ink);
                GUI.Label(new Rect(box.x + 7, box.y + 5, box.width - 12, 30), health, body);
            }
            float x = view.x * 0.5f, y = view.y * 0.5f;
            Fill(new Rect(x - 2, y - 2, 4, 4), prompt == null ? Paper : Gold);
            if (hit)
            {
                Color tint = headshot ? Gold : Paper;
                var preRotation = GUI.matrix;
                GUIUtility.RotateAroundPivot(45, new Vector2(x, y));
                Fill(new Rect(x - 12, y - 1, 7, 2), tint);
                Fill(new Rect(x + 5, y - 1, 7, 2), tint);
                Fill(new Rect(x - 1, y - 12, 2, 7), tint);
                Fill(new Rect(x - 1, y + 5, 2, 7), tint);
                GUI.matrix = preRotation;
            }
            if (prompt != null)
            {
                float promptWidth = Mathf.Min(view.x - 24, 242);
                Rect rect = new Rect(x - promptWidth / 2, y + 20, promptWidth, 38);
                Fill(rect, Ink);
                GUI.Label(rect, prompt, center);
            }
            if (!string.IsNullOrWhiteSpace(subtitle))
            {
                float subWidth = Mathf.Min(670, view.x - 32);
                float subHeight = TextHeight(center, subtitle, subWidth - 32);
                Rect rect = new Rect(x - subWidth / 2, view.y - subHeight - 87, subWidth, subHeight + 20);
                Fill(rect, Ink);
                GUI.Label(new Rect(rect.x + 16, rect.y + 10, subWidth - 32, subHeight), subtitle, center);
            }
            GUI.matrix = matrix;
        }
    }
}
