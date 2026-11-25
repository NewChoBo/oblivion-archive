using System;
using System.Collections.Generic;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Archive
{
    internal sealed class PlayerRig
    {
        readonly Transform owner, rig, model, tool, leftArm, rightArm;
        readonly Camera camera;
        readonly GameObject[] tools = new GameObject[3];
        readonly Animation animation;
        readonly Dictionary<string, Transform> joints = new Dictionary<string, Transform>();
        readonly RaycastHit[] hits = new RaycastHit[48];
        readonly Transform wandFocus, rest, arrow, upper, lower;
        readonly LineRenderer stringTop, stringBottom;
        readonly Light torchLight;
        readonly Vector3 mountScale = Vector3.one * (1.68f / 1.7904f);
        static Material glove, sleeve, metal, flame, cord;
        float stance, cycle, boom = 2.85f, landing;
        bool wasAirborne;
        public bool Third { get; private set; }
        public Vector3 Eye { get; private set; }
        public Vector3 Tip { get; private set; }
        public string Clip { get; private set; }
        public Transform FirearmMount { get; }
        public PlayerRig(Transform owner, Camera camera)
        {
            this.owner = owner;
            this.camera = camera;
            rig = new GameObject("Equipment presentation").transform;
            rig.SetParent(owner, false);
            var prefab = Resources.Load<GameObject>("ArchivePlayer/Scribe");
            if (!prefab)
                throw new InvalidOperationException("Missing player rig. Rebuild the chapter assets.");
            model = Object.Instantiate(prefab, rig).transform;
            model.localScale = mountScale;
            animation = model.GetComponent<Animation>();
            animation.enabled = false;
            foreach (Transform j in model.GetComponentsInChildren<Transform>(true))
                joints[j.name.StartsWith("mixamorig:") ? j.name.Substring(10) : j.name] = j;
            if (!glove)
            {
                glove = Resources.Load<Material>("ArchivePlayer/ScribeLeather");
                sleeve = Resources.Load<Material>("ArchivePlayer/ScribeLinen");
                metal = Mat(new Color(.48f, .30f, .13f));
                flame = Mat(new Color(1, .65f, .14f), true);
                cord = Mat(new Color(.84f, .68f, .35f), true);
            }
            leftArm = Arm("Left view arm", -1);
            rightArm = Arm("Right view arm", 1);
            tool = new GameObject("Held implement").transform;
            tool.SetParent(rig, false);
            FirearmMount = new GameObject("Firearm grip").transform;
            FirearmMount.SetParent(rig, false);
            for (int i = 0; i < 2; i++)
            {
                string key = i == 0 ? "vesper-quill" : "dawn-folio";
                var source = Resources.Load<GameObject>("ArchivePlayer/" + key);
                if (!source)
                    throw new InvalidOperationException("Missing weapon model " + key);
                tools[i] = Object.Instantiate(source, tool);
            }
            wandFocus = Child(tools[0], "Focus");
            rest = Child(tools[1], "ArrowRest");
            arrow = Child(tools[1], "LightArrow");
            upper = Child(tools[1], "UpperNock");
            lower = Child(tools[1], "LowerNock");
            stringTop = String(tools[1].transform);
            stringBottom = String(tools[1].transform);
            tools[2] = new GameObject("Lantern torch");
            tools[2].transform.SetParent(tool, false);
            Part(tools[2].transform, "Handle", PrimitiveType.Cylinder, new Vector3(0, .12f, 0),
                 new Vector3(.045f, .23f, .045f), metal);
            var tip = Part(tools[2].transform, "Flame", PrimitiveType.Sphere, Vector3.up * .39f,
                           new Vector3(.105f, .2f, .105f), flame);
            torchLight = tip.gameObject.AddComponent<Light>();
            torchLight.color = new Color(1, .62f, .28f);
            torchLight.range = 8;
            torchLight.intensity = 2.5f;
        }
        static Transform Child(GameObject obj, string name)
        {
            foreach (var t in obj.GetComponentsInChildren<Transform>(true))
                if (t.name == name)
                    return t;
            throw new InvalidOperationException(obj.name + " is missing socket " + name);
        }
        internal static Material Mat(Color color, bool glow = false)
        {
            var material = new Material(Shader.Find("Standard")) { color = color };
            if (glow)
            {
                material.EnableKeyword("_EMISSION");
                material.SetColor("_EmissionColor", color * 1.2f);
            }
            return material;
        }
        static Transform Part(Transform p, string name, PrimitiveType kind, Vector3 pos, Vector3 size,
                              Material mat)
        {
            var obj = GameObject.CreatePrimitive(kind);
            obj.name = name;
            obj.transform.SetParent(p, false);
            obj.transform.localPosition = pos;
            obj.transform.localScale = size;
            obj.GetComponent<Collider>().enabled = false;
            Object.Destroy(obj.GetComponent<Collider>());
            obj.GetComponent<Renderer>().sharedMaterial = mat;
            return obj.transform;
        }
        Transform Arm(string name, int side)
        {
            var arm = new GameObject(name).transform;
            arm.SetParent(rig, false);
            Part(arm, "Sleeve", PrimitiveType.Capsule, Vector3.zero, Vector3.one, sleeve);
            var palm = new GameObject("Gloved hand").transform;
            palm.SetParent(arm, false);
            Part(palm, "Palm", PrimitiveType.Sphere, new Vector3(.015f * side, 0, 0),
                 new Vector3(.071f, .107f, .075f), glove);
            var thumb = Part(palm, "Thumb", PrimitiveType.Capsule, new Vector3(-.019f * side, .03f, .014f),
                             new Vector3(.026f, .037f, .026f), glove);
            thumb.localRotation = Quaternion.Euler(0, 0, -48 * side);
            for (int i = 0; i < 4; i++)
            {
                var finger = Part(palm, "Curled finger", PrimitiveType.Capsule,
                                  new Vector3(-.017f * side, .017f - i * .017f, -.022f),
                                  new Vector3(.018f, .025f, .018f), glove);
                finger.localRotation = Quaternion.Euler(0, 0, 65 * side);
            }
            Part(arm, "Wristband", PrimitiveType.Cylinder, Vector3.zero, new Vector3(.09f, .036f, .09f), glove);
            return arm;
        }
        static LineRenderer String(Transform root)
        {
            var o = new GameObject("Bowstring");
            o.transform.SetParent(root, false);
            var l = o.AddComponent<LineRenderer>();
            l.sharedMaterial = cord;
            l.startWidth = l.endWidth = .004f;
            l.positionCount = 2;
            return l;
        }
        public void Toggle()
        {
            Third = !Third;
            boom = 2.85f;
        }
        public void Reset()
        {
            stance = cycle = landing = 0;
            boom = 2.85f;
            wasAirborne = false;
        }

        public bool Cast(Vector3 from, Vector3 direction, float distance, out RaycastHit best, float radius = 0)
        {
            best = default;
            int n =
                radius > 0
                    ? Physics.SphereCastNonAlloc(from, radius, direction, hits, distance,
                                                 Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore)
                    : Physics.RaycastNonAlloc(from, direction, hits, distance, Physics.DefaultRaycastLayers,
                                              QueryTriggerInteraction.Ignore);
            float nearest = float.PositiveInfinity;
            for (int i = 0; i < n; i++)
                if (hits[i].distance < nearest && !hits[i].collider.transform.IsChildOf(owner))
                {
                    nearest = hits[i].distance;
                    best = hits[i];
                }
            return !float.IsPositiveInfinity(nearest);
        }

        public void Pose(float dt, float pitch, int posture, Vector3 localMotion, bool running, bool grounded,
                         float verticalSpeed, PlayerBindings prefs, int slot, bool torch, float draw,
                         float cast, float reload, bool armed)
        {
            float target = posture == 0 ? 0 : posture == 1 ? .3f : .86f;
            stance = Mathf.MoveTowards(stance, target, dt * (posture == 2 ? .86f / .34f : 1));
            float crouch = Mathf.Clamp01(stance / .3f), prone = Mathf.Clamp01((stance - .3f) / .56f);
            float eyeHeight = Mathf.Lerp(Mathf.Lerp(1.56f, 1.11f, crouch), .52f, prone);
            float forward = Mathf.Lerp(Mathf.Lerp(.085f, .196f, crouch), .415f, prone);
            Eye = owner.position + Vector3.up * eyeHeight;
            float low = posture == 2 ? .52f : posture == 1 ? 1.11f : 1.56f;
            Vector3 lowEye = owner.position + Vector3.up * low;
            if (eyeHeight > low && Cast(lowEye, Vector3.up, eyeHeight - low, out var ceiling, .055f))
                Eye = lowEye + Vector3.up * Mathf.Max(0, ceiling.distance - .015f);
            if (Cast(Eye, owner.forward, forward, out var cover, .075f))
                forward = Mathf.Max(0, cover.distance - .015f);
            Eye += owner.forward * forward;
            camera.transform.rotation = owner.rotation * Quaternion.Euler(pitch, 0, 0);
            camera.transform.position = Eye;
            if (Third)
            {
                Vector3 offset = -camera.transform.forward * 2.85f +
                                 camera.transform.right * (prefs.Shoulder * .68f) + Vector3.up * .17f;
                float available = Cast(Eye, offset.normalized, offset.magnitude, out var hit, .13f)
                                      ? Mathf.Max(.05f, hit.distance - .04f)
                                      : offset.magnitude;
                boom = Mathf.Min(available, Mathf.MoveTowards(boom, available, dt * 5));
                camera.transform.position = Eye + offset.normalized * boom;
            }
            model.gameObject.SetActive(Third && boom > .32f);
            float speed = localMotion.magnitude;
            cycle += dt * (speed > .15f ? Mathf.Clamp(speed / (running         ? 5.2f
                                                               : prone > .98f  ? .8f
                                                               : crouch > .99f ? 1.65f
                                                                               : 3),
                                                      .4f, 1.5f)
                                        : 1);
            if (Third)
            {
                string dir = Mathf.Abs(localMotion.x) > Mathf.Abs(localMotion.z)
                                 ? (localMotion.x < 0 ? "Left" : "Right")
                                 : (localMotion.z < 0 ? "Back" : "Forward");
                float t = cycle;
                if (stance > 0 && stance < .3f)
                {
                    Clip = "CrouchDown";
                    t = stance / .3f;
                }
                else if (stance > .3f && stance < .86f)
                {
                    Clip = "LowerToProne";
                    t = prone;
                }
                else if (prone >= .999f)
                    Clip = speed > .12f ? "Prone" + dir : "ProneIdle";
                else if (crouch >= .999f)
                    Clip = speed > .12f ? "Crouch" + dir : "CrouchIdle";
                else if (speed < .12f || !grounded)
                    Clip = "YBot_Idle";
                else if (running)
                    Clip = "YBot_Run";
                else
                    Clip = dir == "Left"    ? "YBot_LeftStrafeWalk"
                           : dir == "Right" ? "YBot_RightStrafeWalk"
                                            : "YBot_Walk";
                var clip = animation.GetClip(Clip);
                if (clip)
                {
                    float sample = Clip == "CrouchDown" || Clip == "LowerToProne"
                                       ? clip.length * t
                                       : Mathf.Repeat((localMotion.z < 0 && Clip == "YBot_Walk" ? -1 : 1) * t,
                                                      clip.length);
                    clip.SampleAnimation(model.gameObject, sample);
                }
                // Apply the same airborne and landing bend as the Babylon pose on top of the imported clip.
                if (wasAirborne && grounded && speed < .1f)
                    landing = .16f;
                landing = Mathf.Max(0, landing - dt);
                wasAirborne = !grounded;
                float bend = !grounded ? .24f + .17f * Mathf.Clamp01(Mathf.Abs(verticalSpeed) / 5)
                                       : .26f * landing / .16f;
                if (bend > 0)
                {
                    float angle = bend * Mathf.Rad2Deg;
                    joints["LeftUpLeg"].Rotate(Vector3.right, -angle);
                    joints["RightUpLeg"].Rotate(Vector3.right, -angle);
                    joints["LeftLeg"].Rotate(Vector3.right, 1.7f * angle);
                    joints["RightLeg"].Rotate(Vector3.right, 1.7f * angle);
                }
                model.localPosition = Vector3.up * (.02f * prone);
            }
            for (int i = 0; i < tools.Length; i++)
                tools[i].SetActive(armed && i == slot);
            leftArm.gameObject.SetActive(!Third);
            rightArm.gameObject.SetActive(!Third);
            float side = prefs.LeftHand ? -1 : 1;
            // First-person offsets belong to the view frame. A world-down wrist offset pushes both hands
            // behind the near plane when the player looks toward the ceiling.
            Vector3 f = camera.transform.forward, r = owner.right, u = Third ? Vector3.up : camera.transform.up;
            if (!armed)
            {
                Vector3 gripGun = Eye + side * r * (Third ? .23f : .18f) + f * (Third ? .32f : .33f) -
                                  u * (Third ? .32f : .19f);
                Vector3 support = gripGun + f * .23f;
                FirearmMount.SetPositionAndRotation(gripGun, camera.transform.rotation);
                Vector3 lh = prefs.LeftHand ? gripGun : support, rh = prefs.LeftHand ? support : gripGun;
                if (Third)
                {
                    Reach("Left", lh);
                    Reach("Right", rh);
                }
                else
                {
                    ViewArm(leftArm, Eye - r * .27f - u * .36f - f * .12f, lh);
                    ViewArm(rightArm, Eye + r * .27f - u * .36f - f * .12f, rh);
                }
                return;
            }
            float wave = cast < 0 ? 0 : Mathf.Sin(cast * Mathf.PI * 2);
            Vector3 grip = Eye + r * (side * (Third ? .23f : .19f)) + u * (Third ? -.36f : -.24f) +
                           f * (Third ? .30f : .36f);
            if (slot == 0)
                grip += r * side * (.15f * wave) + u * (.065f * wave);
            if (reload > 0)
                grip += u * (-.07f * Mathf.Sin(reload * Mathf.PI));
            Quaternion rot = Quaternion.LookRotation(f, u);
            if (slot == 0)
                rot *= Quaternion.Euler(-53 + 36 * Mathf.Max(0, wave), side * (-13 + 36 * wave), side * 13);
            if (slot == 1)
                rot *= Quaternion.Euler(0, 0, side * -13);
            if (slot == 2)
                rot = (Third ? owner.rotation : camera.transform.rotation) * Quaternion.Euler(6, 0, side * -10);
            Vector3 toGrip = grip - Eye;
            if (Cast(Eye, toGrip.normalized, toGrip.magnitude, out var gripHit, .05f))
                grip = Eye + toGrip.normalized * Mathf.Max(.03f, gripHit.distance - .045f);
            tool.SetPositionAndRotation(grip, rot);
            torchLight.enabled = slot == 2 && torch;
            torchLight.transform.GetComponent<Renderer>().enabled = torch;
            Vector3 loose;
            if (slot == 1)
            {
                // Right-handed view uses a right-side bow presentation; the left hand holds its grip.
                Vector3 nock = rest.position - tool.forward * (.10f + .38f * draw);
                arrow.position = nock;
                stringTop.SetPosition(0, upper.position);
                stringTop.SetPosition(1, nock);
                stringBottom.SetPosition(0, lower.position);
                stringBottom.SetPosition(1, nock);
                loose = nock;
                Tip = rest.position + tool.forward * .12f;
            }
            else
            {
                loose = reload > 0 ? grip + u * .16f + f * (.12f * Mathf.Sin(reload * Mathf.PI))
                                   : Eye - r * side * .25f - u * .41f + f * .27f;
                Tip = slot == 0 ? wandFocus.position : torchLight.transform.position;
            }
            bool gripLeft = slot == 1 ? !prefs.LeftHand : prefs.LeftHand;
            Vector3 left = gripLeft ? grip : loose, right = gripLeft ? loose : grip;
            if (Third)
            {
                Reach("Left", left);
                Reach("Right", right);
            }
            else
            {
                ViewArm(leftArm, Eye - r * .27f - u * .38f - f * .11f, left);
                ViewArm(rightArm, Eye + r * .27f - u * .38f - f * .11f, right);
            }
        }

        static void ViewArm(Transform arm, Vector3 elbow, Vector3 hand)
        {
            Vector3 d = hand - elbow;
            var sleeve = arm.GetChild(0);
            sleeve.position = (elbow + hand) * .5f;
            sleeve.rotation = Quaternion.FromToRotation(Vector3.up, d);
            sleeve.localScale = new Vector3(.085f, d.magnitude * .5f, .085f);
            var palm = arm.GetChild(1);
            palm.position = hand;
            palm.rotation = Quaternion.LookRotation(d);
            var cuff = arm.GetChild(2);
            cuff.SetPositionAndRotation(hand - d.normalized * .065f, sleeve.rotation);
        }
        void Reach(string side, Vector3 goal)
        {
            var shoulder = joints[side + "Arm"];
            var elbow = joints[side + "ForeArm"];
            var wrist = joints[side + "Hand"];
            Reach(shoulder, elbow, wrist, goal, -Vector3.up + owner.right * (side == "Left" ? -.45f : .45f));
        }

        // World-space two-bone reach. The pole determines the side of the shoulder-to-target line
        // on which the elbow bends without changing the imported bone lengths.
        internal static void Reach(Transform shoulder, Transform elbow, Transform wrist, Vector3 goal,
                                   Vector3 elbowPole)
        {
            Vector3 delta = goal - shoulder.position;
            float a = Vector3.Distance(shoulder.position, elbow.position),
                  b = Vector3.Distance(elbow.position, wrist.position);
            float c = Mathf.Clamp(delta.magnitude, Mathf.Abs(a - b) + .001f, a + b - .001f);
            Vector3 axis = delta.normalized;
            float along = (a * a - b * b + c * c) / (2 * c);
            Vector3 pole = Vector3.ProjectOnPlane(elbowPole, axis).normalized;
            Vector3 bend =
                shoulder.position + axis * along + pole * Mathf.Sqrt(Mathf.Max(0, a * a - along * along));
            shoulder.rotation =
                Quaternion.FromToRotation(elbow.position - shoulder.position, bend - shoulder.position) *
                shoulder.rotation;
            elbow.rotation = Quaternion.FromToRotation(wrist.position - elbow.position, goal - elbow.position) *
                             elbow.rotation;
        }
    }
}
