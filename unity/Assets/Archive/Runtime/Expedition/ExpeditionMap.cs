using System.Collections.Generic;
using UnityEngine;

namespace Archive
{
    // The map samples the playable physics scene at the player's elevation. This includes the citadel after restoration.
    // A cell is 0.45 m. Only newly revealed cells need surveying while moving across a platform.
    internal sealed class ExpeditionMap
    {
        const float Cell = .45f;
        const int Width = 51, Height = 39;
        const string Pref = "archive.unity.minimap";
        readonly Dictionary<Vector2Int, Color32> chart = new();
        readonly HashSet<Transform> landmarks = new();
        readonly RaycastHit[] hits = new RaycastHit[12];
        readonly Color32[] pixels = new Color32[Width * Height];
        readonly Color32 empty = new(17,26,34,255), floor = new(75,96,99,255), wall = new(157,167,160,255);
        Texture2D texture;
        Vector2Int center;
        int next, band = int.MinValue, phase = -1;
        bool quarry, visible = PlayerPrefs.GetInt(Pref,1) != 0;
        Transform owner;
        GUIStyle title;
        static Vector2Int Coord(Vector3 p) => new(Mathf.RoundToInt(p.x / Cell), Mathf.RoundToInt(p.z / Cell));
        internal void Toggle() { visible=!visible; PlayerPrefs.SetInt(Pref,visible?1:0); PlayerPrefs.Save(); }
        internal void Note(Transform target) { if(target) landmarks.Add(target); }
        internal void ResetDiscovery() { landmarks.Clear(); chart.Clear(); band=int.MinValue; }
        internal void Dispose() { if(texture) Object.Destroy(texture); }
        bool StaticHit(RaycastHit hit) => !hit.collider.isTrigger && !hit.transform.IsChildOf(owner) &&
            !hit.collider.GetComponentInParent<ExpeditionFoe>();
        Color32 Survey(Vector2Int cell, float feet)
        {
            Vector3 at = new Vector3(cell.x*Cell, feet+.7f, cell.y*Cell);
            int count=Physics.RaycastNonAlloc(at,Vector3.down,hits,2.55f,Physics.DefaultRaycastLayers,QueryTriggerInteraction.Ignore);
            bool stands=false;
            for(int i=0;i<count;i++) if(hits[i].normal.y>=.52f && StaticHit(hits[i])) { stands=true; break; }
            // Cross the cell at torso height. Straight and curved walls retain their gaps and doors.
            for(int axis=0;axis<2;axis++) {
                Vector3 direction=axis==0?Vector3.right:Vector3.forward;
                count=Physics.RaycastNonAlloc(at-direction*(Cell*.6f),direction,hits,Cell*1.2f,
                    Physics.DefaultRaycastLayers,QueryTriggerInteraction.Ignore);
                for(int i=0;i<count;i++) if(StaticHit(hits[i])) return wall;
            }
            return stands?floor:empty;
        }
        internal void Advance(Transform player,bool inQuarry,int storyPhase)
        {
            if(!visible)return;
            owner=player;
            int level=Mathf.RoundToInt(player.position.y/1.4f);
            Vector2Int cell=Coord(player.position);
            if(!texture) {
                texture=new Texture2D(Width,Height,TextureFormat.RGBA32,false) { filterMode=FilterMode.Point,wrapMode=TextureWrapMode.Clamp };
            }
            if(level!=band || quarry!=inQuarry || phase!=storyPhase || chart.Count>32000) {
                chart.Clear();next=0;band=level;quarry=inQuarry;phase=storyPhase;
            }
            if(center!=cell) { center=cell; next=0; }
            int budget=112; bool changed=false;
            for(;next<pixels.Length;next++){
                var point=new Vector2Int(center.x+next%Width-Width/2,center.y+next/Width-Height/2);
                if(!chart.TryGetValue(point,out var color)) {
                    if(budget--<=0)break;
                    chart[point]=color=Survey(point,player.position.y);
                }
                pixels[next]=color; changed=true;
            }
            if(changed) {
                for(int i=next;i<pixels.Length;i++) {
                    var point=new Vector2Int(center.x+i%Width-Width/2,center.y+i/Width-Height/2);
                    pixels[i]=chart.TryGetValue(point,out var c)?c:empty;
                }
                texture.SetPixels32(pixels);texture.Apply(false);
            }
        }
        static void Fill(Rect r,Color c) { var old=GUI.color;GUI.color=c;GUI.DrawTexture(r,Texture2D.whiteTexture);GUI.color=old; }
        internal void Draw(ExpeditionRuntime exp, Transform player)
        {
            if(!visible || !texture || exp.InventoryOpen || exp.Dead)return;
            float w=Mathf.Clamp(Screen.width*.19f,82,188);
            var map=new Rect(Screen.width-w-10,24,w,w*Height/Width);
            if(Screen.height<410) { map.width=Mathf.Min(w,116);map.height=map.width*Height/Width;map.x=Screen.width-map.width-6; }
            if(title==null) title=new GUIStyle(GUI.skin.label){font=Resources.Load<Font>("ArchiveHudFont"),fontSize=12,alignment=TextAnchor.MiddleRight};
            GUI.Label(new Rect(map.x-12,4,map.width+12,20), exp.Text(quarry?"exp.map.quarry":"exp.map.archive"),title);
            Fill(new Rect(map.x-1,map.y-1,map.width+2,map.height+2),new Color(.55f,.5f,.36f));
            GUI.DrawTexture(map,texture);
            Vector2 Pixel(Vector3 position) => new(map.center.x+(position.x/Cell-center.x)*map.width/Width,
                map.center.y-(position.z/Cell-center.y)*map.height/Height);
            foreach(var mark in landmarks) {
                if(!mark || !mark.gameObject.activeInHierarchy)continue;
                var p=Pixel(mark.position);
                if(map.Contains(p))Fill(new Rect(p.x-2,p.y-2,4,4),new Color(.98f,.72f,.33f));
            }
            var dot=Pixel(player.position);
            var matrix=GUI.matrix; GUIUtility.RotateAroundPivot(player.eulerAngles.y,dot);
            Fill(new Rect(dot.x-1,dot.y-7,2,7),Color.white);
            Fill(new Rect(dot.x-3,dot.y-2,6,5),new Color(.28f,.9f,.92f));
            GUI.matrix=matrix;
        }
    }
}
