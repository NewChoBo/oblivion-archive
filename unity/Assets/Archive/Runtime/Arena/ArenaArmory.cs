using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Archive.Arena
{
    internal sealed class ArenaArmory
    {
        readonly JObject[] catalog;
        readonly int[] stock = new int[2], reserve = new int[2];
        readonly bool[] owned = new bool[2];
        int slot;
        float cooldown, reload;
        public int Credits { get; private set; }
        public int Magazine => stock[slot];
        public int Reserve => reserve[slot];
        public string Id => (string)catalog[slot]["id"];
        public bool Reloading => reload > 0;
        public bool RifleOwned => owned[1];
        public bool Automatic => (bool)catalog[slot]["automatic"];
        public ArenaArmory(JToken definitions)
        {
            catalog = definitions.Children<JObject>().ToArray();
        }
        public void Round(bool fresh)
        {
            Credits = fresh ? 800 : Mathf.Min(9000, Credits + 800);
            slot = 0;
            owned[0] = true;
            owned[1] = false;
            Restock();
        }
        public void Restock()
        {
            for (int i = 0; i < catalog.Length; i++)
            {
                stock[i] = (int)catalog[i]["capacity"];
                reserve[i] = (int)catalog[i]["reserve"];
            }
            cooldown = reload = 0;
        }
        public void Reward()
        {
            Credits = Mathf.Min(9000, Credits + 300);
        }
        public void Select(int i)
        {
            if (owned[i] && i != slot)
            {
                slot = i;
                reload = 0;
            }
        }
        public bool Buy(bool rifle)
        {
            if (rifle)
            {
                int price = (int)catalog[1]["price"];
                if (owned[1] || Credits < price)
                    return false;
                Credits -= price;
                owned[1] = true;
                Select(1);
                return true;
            }
            if (Credits < 120 || reserve[slot] == (int)catalog[slot]["reserve"])
                return false;
            Credits -= 120;
            reserve[slot] = (int)catalog[slot]["reserve"];
            return true;
        }
        public void Reload()
        {
            if (reload <= 0 && Magazine < (int)catalog[slot]["capacity"] && Reserve > 0)
                reload = (float)catalog[slot]["reloadSeconds"];
        }
        public int Shoot()
        {
            if (cooldown > 0 || reload > 0 || stock[slot] <= 0)
                return 0;
            stock[slot]--;
            cooldown = (float)catalog[slot]["interval"];
            if (stock[slot] == 0)
                Reload();
            return (int)catalog[slot]["damage"];
        }
        public void Tick(float dt)
        {
            cooldown = Mathf.Max(0, cooldown - dt);
            if (reload <= 0)
                return;
            reload = Mathf.Max(0, reload - dt);
            if (reload > 0)
                return;
            int n = Mathf.Min(reserve[slot], (int)catalog[slot]["capacity"] - stock[slot]);
            stock[slot] += n;
            reserve[slot] -= n;
        }
    }
}
