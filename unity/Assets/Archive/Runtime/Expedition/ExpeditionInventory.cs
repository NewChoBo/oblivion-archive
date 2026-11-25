using UnityEngine;

namespace Archive
{
    // Fixed panel, independently scrolling content. Short viewports retain both the tab bar and Close button.
    internal sealed class ExpeditionInventory
    {
        int tab;
        Vector2 scroll;
        GUIStyle title, label, button, section;
        static readonly Color Ink = new(0.055f, 0.075f, 0.095f, 0.98f);
        internal void Show(int index) { tab = index; scroll = Vector2.zero; }
        void Prepare()
        {
            if (title != null) return;
            Font font = Resources.Load<Font>("ArchiveHudFont");
            label = new GUIStyle(GUI.skin.label) { fontSize = 16, wordWrap = true, font = font };
            title = new GUIStyle(label) { fontSize = 25, fontStyle = FontStyle.Bold };
            section = new GUIStyle(label) { fontSize = 17, fontStyle = FontStyle.Bold };
            section.normal.textColor = new Color(0.89f, 0.74f, 0.48f);
            button = new GUIStyle(GUI.skin.button) { fontSize = 15, wordWrap = true, font = font };
        }
        static void Fill(Rect r, Color c) {
            Color old = GUI.color; GUI.color = c; GUI.DrawTexture(r, Texture2D.whiteTexture); GUI.color = old;
        }
        bool portrait;
        bool Press(string text) => GUILayout.Button(text, button, GUILayout.MinHeight(portrait ? 40 : 26));
        internal void Draw(ExpeditionRuntime runtime, ExpeditionLedger state, bool stash)
        {
            Prepare();
            var matrix = GUI.matrix;
            portrait = Screen.width < 560 && Screen.height > Screen.width;
            // A portrait ledger has enough vertical room for full-size text and touch controls.
            float scale = portrait ? 1f : Mathf.Clamp(Mathf.Min(Screen.width / 800f, Screen.height / 505f), 0.68f, 1.3f);
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));
            float w = Screen.width / scale, h = Screen.height / scale;
            var panel = new Rect(0, 0, Mathf.Min(w - 18, 720), Mathf.Min(h - 18, portrait ? 650 : 490));
            panel.center = new Vector2(w/2, h/2);
            Fill(new Rect(0,0,w,h), new Color(0,0,0,0.55f)); Fill(panel, Ink);
            Fill(new Rect(panel.x, panel.y, panel.width, 3), section.normal.textColor);
            GUILayout.BeginArea(new Rect(panel.x+16,panel.y+11,panel.width-32,panel.height-22));
            GUILayout.BeginHorizontal();
            GUILayout.Label(runtime.Text("exp.ui.title"), title, GUILayout.ExpandWidth(true));
            if (Press(runtime.Text("exp.ui.close"))) runtime.CloseBag();
            GUILayout.EndHorizontal();
            GUILayout.BeginHorizontal();
            string[] tabs = { "exp.ui.gear", "exp.ui.storage", "exp.ui.growth", "exp.ui.records" };
            for (int i=0;i<tabs.Length;i++) {
                GUI.enabled = i != tab;
                if (Press(runtime.Text(tabs[i]))) Show(i);
            }
            GUI.enabled = true;
            GUILayout.EndHorizontal();
            scroll = GUILayout.BeginScrollView(scroll);
            void Heading(string s) => GUILayout.Label(s,section);
            string Item(string id) => runtime.Text("exp.gear."+id);
            void Row(string item, string action, System.Action onClick) {
                GUILayout.BeginHorizontal();
                GUILayout.Label(Item(item), label, GUILayout.ExpandWidth(true));
                if (Press(runtime.Text(action))) onClick();
                GUILayout.EndHorizontal();
            }
            if (tab == 0) {
                Heading(runtime.Text("exp.ui.worn"));
                for (int i=0;i<3;i++) {
                    var item=state.slots[i]; if (item==null) continue;
                    if(i==2) GUILayout.Label(Item(item),label);
                    else Row(item, "exp.ui.unequip", ()=>runtime.MoveGear(item,"worn","bag"));
                }
                Heading(string.Format(runtime.Text("exp.ui.bag"),state.bag.Count,ExpeditionLedger.BagLimit));
                foreach(var item in state.bag.ToArray())
                    Row(item,"exp.ui.equip",()=>runtime.MoveGear(item,"bag","worn"));
                if (state.bag.Count==0) GUILayout.Label(runtime.Text("exp.ui.empty"),label);
                GUILayout.Label(string.Format(runtime.Text("exp.ui.stock"),runtime.Loaded(0),runtime.Reserve(0),runtime.Loaded(1),runtime.Reserve(1)),label);
            } else if (tab==1) {
                if (!stash) GUILayout.Label(runtime.Text("exp.ui.stashDistance"), label);
                GUI.enabled = stash;
                Heading(string.Format(runtime.Text("exp.ui.bag"),state.bag.Count,ExpeditionLedger.BagLimit));
                foreach(var item in state.bag.ToArray()) Row(item,"exp.ui.deposit",()=>runtime.MoveGear(item,"bag","storage"));
                Heading(string.Format(runtime.Text("exp.ui.stash"),state.storage.Count,ExpeditionLedger.StorageLimit));
                foreach(var item in state.storage.ToArray()) Row(item,"exp.ui.withdraw",()=>runtime.MoveGear(item,"storage","bag"));
                GUI.enabled=true;
                if(state.storage.Count==0) GUILayout.Label(runtime.Text("exp.ui.empty"),label);
            } else if (tab==2) {
                Heading(string.Format(runtime.Text("exp.ui.xp"),state.level,state.xp,state.NextLevel,state.points));
                foreach(string skill in ExpeditionLedger.SkillIds) {
                    int rank=state.skills[skill]; GUILayout.BeginHorizontal();
                    GUILayout.Label(runtime.Text("exp.skill."+skill)+"  "+rank+"/3", label, GUILayout.ExpandWidth(true));
                    GUI.enabled=state.points>0 && rank<3;
                    if(Press(runtime.Text("exp.ui.train"))) runtime.Upgrade(skill);
                    GUI.enabled=true; GUILayout.EndHorizontal();
                }
                if(state.quest) GUILayout.Label(string.Format(runtime.Text("exp.ui.hunt"),Mathf.Min(3,state.kills)),label);
            } else {
                var story = runtime.GetComponent<ChapterStory>();
                if (!story || story.Records.Count == 0) GUILayout.Label(runtime.Text("exp.ui.empty"), label);
                else foreach (var record in story.Records) {
                    Heading(story.RecordTitle(record));
                    GUILayout.Label(story.RecordDescription(record), label);
                }
            }
            GUILayout.EndScrollView(); GUILayout.EndArea();
            GUI.matrix=matrix;
        }
    }
}
