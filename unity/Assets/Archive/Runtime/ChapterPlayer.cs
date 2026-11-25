using UnityEngine;
using Archive.Arena;

namespace Archive
{
    [RequireComponent(typeof(CharacterController))]
    public sealed class ChapterPlayer : MonoBehaviour
    {
        // A scene authored by the first Unity slice can still be regenerated with the shared plan.
        public Transform photo, seal;
        public GameObject gate;

        enum ScreenMode
        {
            Title,
            Play,
            Pause
        }
        const float StandingHeight = 1.68f, CrouchHeight = 1.25f, ProneHeight = .66f, Reach = 2.8f;
        readonly Collider[] overhead = new Collider[24];
        readonly ChapterHud hud = new ChapterHud();
        CharacterController body;
        ChapterText text;
        ChapterStory story;
        PlayerRig rig;
        ScreenMode mode;
        Vector3 spawn, lastMouse;
        float spawnHeading, pitch, verticalSpeed, noticeTime;
        string notice = "", prompt, focusId;
        int posture;
        bool captureAttempted, ignoreShot;
        public bool InArena { get; private set; }
        bool HasSavedGame => (story && story.HasSave) || (Expedition && Expedition.HasSave);
        public bool IsPlaying => mode == ScreenMode.Play;
        public bool CanAct => IsPlaying && !InputBlocked && Bindings != null && !Bindings.Open &&
                              (InArena || ((!story || story.Mode == "play") &&
                                           (!Expedition || (!Expedition.InventoryOpen && !Expedition.Dead))));
        public bool InputBlocked { get; set; }
        public bool Korean => text != null && text.IsKorean;
        public string Text(string key) => text[key];
        public Camera ViewCamera { get; private set; }
        public PlayerBindings Bindings { get; private set; }
        public ChapterWeapons Weapons { get; private set; }
        public ExpeditionRuntime Expedition { get; private set; }
        public bool PhotoRead => story && story.Phase >= 1;
        public bool SealOpen => story && story.Phase >= 2;
        public bool ThirdPerson => rig.Third;
        public Transform FirearmMount => rig.FirearmMount;
        public string Posture => posture == 2 ? "prone" : posture == 1 ? "crouch" : "standing";
        public string AnimationClip => rig.Clip;
        public bool InteractPressed => CanAct && Bindings.Down(PlayerAction.Interact);
        public bool FirePressed =>
            CanAct && (Bindings.Down(PlayerAction.Fire) || (!ignoreShot && Input.GetMouseButtonDown(0)));
        public bool FireReleased =>
            CanAct && (Input.GetMouseButtonUp(0) || Input.GetKeyUp(Bindings.Key(PlayerAction.Fire)));
        public bool FireHeld => CanAct && (Input.GetMouseButton(0) || Bindings.Held(PlayerAction.Fire));

        void Awake()
        {
            text = new ChapterText();
            Bindings = new PlayerBindings();
            body = GetComponent<CharacterController>();
            ViewCamera = GetComponentInChildren<Camera>();
            spawn = transform.position;
            spawnHeading = transform.eulerAngles.y;
            body.minMoveDistance = 0;
            body.stepOffset = .32f;
            SetCapsule(StandingHeight);
            rig = new PlayerRig(transform, ViewCamera);
            Weapons = new ChapterWeapons(this, rig, ViewCamera);
            Expedition = GetComponent<ExpeditionRuntime>();
            story = GetComponent<ChapterStory>();
            if (story)
            {
                story.Korean = () => Korean;
                story.RespawnRequested += Respawn;
                story.ReturnToTitleRequested += ReturnToTitle;
                story.RetryRequested += Retry;
            }
            lastMouse = Input.mousePosition;
            Pose(0, Vector3.zero, false);
        }
        void OnDestroy()
        {
            if (story)
            {
                story.RespawnRequested -= Respawn;
                story.ReturnToTitleRequested -= ReturnToTitle;
                story.RetryRequested -= Retry;
            }
        }
        void Respawn(Vector3 feet) => Teleport(feet, spawnHeading);
        public void Teleport(Vector3 feet, float yaw)
        {
            Weapons.ResetTransient();
            rig.Reset();
            body.enabled = false;
            transform.SetPositionAndRotation(feet, Quaternion.Euler(0, yaw, 0));
            posture = 0;
            SetCapsule(StandingHeight);
            pitch = verticalSpeed = 0;
            body.enabled = true;
            focusId = prompt = null;
            noticeTime = 0;
            Pose(0, Vector3.zero, false);
            Physics.SyncTransforms();
        }
        public void SetArena(bool active)
        {
            Weapons.ResetArena();
            InArena = active;
            Expedition?.CloseBag();
            focusId = prompt = null;
        }
        public void BeginPlay()
        {
            mode = ScreenMode.Play;
            lastMouse = Input.mousePosition;
            captureAttempted = false;
            ignoreShot = false;
        }
        void StartChapter(bool resume)
        {
            SetArena(false);
            BeginPlay();
            if (resume)
            {
                story.ContinueSaved();
                Expedition?.ContinueVisit();
            }
            else
            {
                Expedition?.NewGame();
                story.StartNew();
            }
        }
        void Retry()
        {
            BeginPlay();
            Expedition?.Retry();
            if (story)
                story.Retry();
            else
                Respawn(spawn);
        }
        public void ReturnToTitle()
        {
            if (InArena)
                GetComponent<ArchiveArena>()?.ResetOnTitle();
            SetArena(false);
            InputBlocked = false;
            mode = ScreenMode.Title;
            FreeCursor();
            Teleport(spawn, spawnHeading);
        }
        void FreeCursor()
        {
            captureAttempted = false;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }
        void Pause()
        {
            mode = ScreenMode.Pause;
            Weapons.Cancel();
            FreeCursor();
            focusId = prompt = null;
        }
        void OnApplicationFocus(bool focused)
        {
            if (!focused && CanAct)
                Pause();
        }
        public void Notify(string en, string ko, float seconds = 4)
        {
            notice = Korean ? ko : en;
            noticeTime = seconds;
        }

        void Update()
        {
            ignoreShot = false;
            if (Bindings.Open)
            {
                if (Input.GetKeyDown(KeyCode.Escape) && !Bindings.Listening)
                    Bindings.Close();
                return;
            }
            if (ArchiveArena.MenuOpen(this) || InputBlocked)
                return;
            if (!IsPlaying)
            {
                if (Input.GetKeyDown(KeyCode.Return) || Input.GetKeyDown(KeyCode.KeypadEnter) ||
                    (mode == ScreenMode.Pause && Input.GetKeyDown(KeyCode.Escape)))
                {
                    if (mode == ScreenMode.Title)
                        StartChapter(HasSavedGame);
                    else
                        BeginPlay();
                }
                return;
            }
            float dt = Mathf.Min(Time.deltaTime, .1f);
            if (!InArena && Expedition && Expedition.InventoryOpen)
            {
                if (Input.GetKeyDown(KeyCode.Escape) || Bindings.BagPressed)
                    Expedition.CloseBag();
                return;
            }
            if (!InArena && story && story.Mode != "play")
            {
                story.Tick(dt);
                return;
            }
            if (!InArena && Expedition && Expedition.Dead)
            {
                Weapons.Cancel();
                FreeCursor();
                if (Input.GetKeyDown(KeyCode.Return))
                    Retry();
                return;
            }
            if (Input.GetKeyDown(KeyCode.Escape))
            {
                Pause();
                return;
            }
            if (!InArena && Expedition && Bindings.BagPressed)
            {
                Weapons.Cancel();
                FreeCursor();
                Expedition.ToggleBag();
                return;
            }
            if (Bindings.Down(PlayerAction.View))
                rig.Toggle();
            if (Bindings.Down(PlayerAction.Shoulder))
                Bindings.CycleShoulder();
            if (Bindings.Down(PlayerAction.Hand))
                Bindings.FlipHand();
            Look(dt);
            if (Bindings.Down(PlayerAction.Prone))
                ChangePosture(posture == 2 ? 0 : 2);
            if (Bindings.Down(PlayerAction.Crouch))
                ChangePosture(posture == 1 ? 0 : 1);
            bool running = Bindings.Held(PlayerAction.Sprint) && posture == 0;
            Vector3 delta = Move(dt, running);
            Pose(dt, delta, running);
            if (!InArena && transform.position.y < -14)
            {
                if (story)
                    story.Fall();
                else
                    Respawn(spawn);
                Weapons.Cancel();
                FreeCursor();
                return;
            }
            if (!InArena)
            {
                if (!Expedition || !Expedition.InQuarry)
                    story?.Tick(dt);
                Expedition?.Tick(dt);
                if (!CanAct)
                {
                    Weapons.Cancel();
                    FreeCursor();
                    return;
                }
                Interact();
            }
            if (CanAct && (!InArena || !ArchiveArena.UsesFirearms(this)))
                Weapons.Tick(dt, Bindings);
            noticeTime = Mathf.Max(0, noticeTime - dt);
        }
        void Pose(float dt, Vector3 local, bool run)
        {
            rig.Pose(dt, pitch, posture, local, run, body.isGrounded, verticalSpeed, Bindings, Weapons.Selected,
                     Weapons.TorchLit, Weapons.Draw, Weapons.Stroke, Weapons.ReloadMotion,
                     !InArena || !ArchiveArena.UsesFirearms(this));
        }
        void Look(float dt)
        {
            Vector3 mouse = Input.mousePosition;
            var look =
                new Vector2(
                    (Input.GetKey(KeyCode.RightArrow) ? 1 : 0) - (Input.GetKey(KeyCode.LeftArrow) ? 1 : 0),
                    (Input.GetKey(KeyCode.UpArrow) ? 1 : 0) - (Input.GetKey(KeyCode.DownArrow) ? 1 : 0)) *
                (90 * dt);
            if (Bindings.Capture && !captureAttempted && Input.GetMouseButtonDown(0))
            {
                Cursor.lockState = CursorLockMode.Locked;
                lastMouse = mouse;
                ignoreShot = true;
                captureAttempted = true;
            }
            if (Cursor.lockState == CursorLockMode.Locked)
                look += new Vector2(Input.GetAxisRaw("Mouse X"), Input.GetAxisRaw("Mouse Y")) * 2f *
                        Bindings.Sensitivity;
            else if (Input.GetMouseButton(1))
                look += (Vector2)(mouse - lastMouse) * .16f * Bindings.Sensitivity;
            lastMouse = mouse;
            transform.Rotate(0, look.x, 0);
            pitch = Mathf.Clamp(pitch - look.y, -84, 84);
        }
        Vector3 Move(float dt, bool running)
        {
            Vector3 direction = new Vector3(
                (Bindings.Held(PlayerAction.Right) ? 1 : 0) - (Bindings.Held(PlayerAction.Left) ? 1 : 0), 0,
                (Bindings.Held(PlayerAction.Forward) ? 1 : 0) - (Bindings.Held(PlayerAction.Back) ? 1 : 0));
            float speed = posture == 2 ? .8f : posture == 1 ? 1.65f : running ? 5.2f : 3;
            Vector3 velocity = transform.TransformDirection(Vector3.ClampMagnitude(direction, 1)) * speed;
            if (body.isGrounded && verticalSpeed < 0)
                verticalSpeed = -2;
            if (Bindings.Down(PlayerAction.Jump) && body.isGrounded)
            {
                if (posture == 0)
                    verticalSpeed = 5;
                else
                    ChangePosture(0);
            }
            verticalSpeed -= 18 * dt;
            velocity.y = verticalSpeed;
            Vector3 was = transform.position;
            var flags = body.Move(velocity * dt);
            if ((flags & CollisionFlags.Above) != 0 && verticalSpeed > 0)
                verticalSpeed = 0;
            var local = transform.InverseTransformVector(transform.position - was) / Mathf.Max(.001f, dt);
            local.y = 0;
            return local;
        }
        void SetCapsule(float h)
        {
            body.height = h;
            body.center = Vector3.up * (h * .5f);
        }
        void ChangePosture(int next)
        {
            if (!body.isGrounded)
                return;
            float h = next == 2 ? ProneHeight : next == 1 ? CrouchHeight : StandingHeight;
            if (h > body.height)
            {
                float r = body.radius - .01f;
                int count = Physics.OverlapCapsuleNonAlloc(transform.position + Vector3.up * (body.height - r),
                                                           transform.position + Vector3.up * (h - r), r,
                                                           overhead, Physics.DefaultRaycastLayers,
                                                           QueryTriggerInteraction.Ignore);
                for (int i = 0; i < count; i++)
                    if (!overhead[i].transform.IsChildOf(transform))
                    {
                        notice = Text("player.headroom");
                        noticeTime = 2;
                        return;
                    }
            }
            posture = next;
            SetCapsule(h);
        }
        void Interact()
        {
            Collider surface = null;
            Transform eye = ViewCamera.transform;
            if (rig.Cast(eye.position, eye.forward, rig.Third ? Reach + 4 : Reach, out var hit) &&
                Vector3.Distance(rig.Eye, hit.point) <= Reach)
            {
                var to = hit.point - rig.Eye;
                if (!rig.Cast(rig.Eye, to.normalized, Mathf.Max(0, to.magnitude - .013f), out var blocked) ||
                    blocked.collider == hit.collider)
                    surface = hit.collider;
            }
            string other = Expedition ? Expedition.Focus(surface ? surface.transform : null) : null;
            if (other != null)
            {
                prompt = other;
                focusId = Expedition.FocusId;
                if (InteractPressed && Expedition.Interact(surface.transform) && Expedition.InventoryOpen)
                {
                    Weapons.Cancel();
                    FreeCursor();
                }
            }
            else
            {
                bool local = (!Expedition || !Expedition.InQuarry) && story;
                prompt = local ? story.Prompt(surface) : null;
                focusId = local ? story.FocusId(surface) : null;
                if (local && InteractPressed)
                    story.Use(surface);
            }
            prompt =
                string.IsNullOrEmpty(prompt) ? null : Bindings.Label(PlayerAction.Interact) + "   " + prompt;
        }
        void LateUpdate()
        {
            string phase = mode == ScreenMode.Title                 ? "title"
                           : mode == ScreenMode.Pause               ? "paused"
                           : InArena                                ? "arena"
                           : Expedition && Expedition.InventoryOpen ? "inventory"
                           : story && story.Mode != "play"          ? story.Mode
                           : Expedition && Expedition.Dead          ? "dead"
                           : Expedition && Expedition.InQuarry      ? "quarry"
                                                                    : "chapter-" + (story ? story.Phase : 0);
            WebInspection.Tick(transform, pitch, phase, focusId ?? "none");
        }
        void OnGUI()
        {
            if (Bindings == null || text == null || ArchiveArena.MenuOpen(this))
                return;
            if (Bindings.Open)
            {
                Bindings.Draw(text);
                return;
            }
            if (!IsPlaying)
            {
                string action =
                    hud.Menu(text, Bindings, mode == ScreenMode.Title, HasSavedGame, !InArena);
                switch (action)
                {
                case "begin":
                    StartChapter(false);
                    break;
                case "continue":
                    StartChapter(true);
                    break;
                case "resume":
                    BeginPlay();
                    break;
                case "retry":
                    Retry();
                    break;
                case "arena":
                    ArchiveArena.OpenMenu(this);
                    break;
                case "settings":
                    Bindings.Show();
                    break;
                case "title":
                    ReturnToTitle();
                    break;
                }
                return;
            }
            if (InputBlocked)
                return;
            if (!InArena && story && story.Mode != "play")
            {
                story.DrawOverlay();
                return;
            }
            if (!InArena && Expedition && Expedition.InventoryOpen)
            {
                Expedition.DrawInventory();
                return;
            }
            if (!InArena && Expedition && Expedition.Dead)
            {
                if (hud.Death(text))
                    Retry();
                return;
            }
            bool demoGun = InArena && ArchiveArena.UsesFirearms(this);
            string objective = InArena                             ? ""
                               : Expedition && Expedition.InQuarry ? Text("player.quarry")
                               : story                             ? story.Objective
                                                                   : "";
            string header = InArena                             ? ""
                            : Expedition && Expedition.InQuarry ? Text("player.quarryTitle")
                            : story                             ? story.ObjectiveTitle
                                                                : Text("chapter.number");
            hud.Play(header, objective, InArena ? null : prompt,
                     noticeTime > 0      ? notice
                     : !InArena && story ? story.Subtitle
                                         : null,
                     demoGun ? null : Text("weapon." + Weapons.Selected),
                     demoGun ? null
                     : Weapons.Selected == 2
                         ? Text(Weapons.TorchLit ? "controls.on" : "controls.off")
                         : Weapons.Loaded(Weapons.Selected) + " / " + Weapons.Reserve(Weapons.Selected),
                     Weapons.Draw,
                     !InArena && Expedition
                         ? Text("player.health") + " " + Mathf.CeilToInt(Expedition.Health) + "   " +
                               Text("player.armor") + " " + Mathf.CeilToInt(Expedition.Armor)
                         : null,
                     !demoGun && Weapons.ShowHit, Weapons.LastHitWasHead);
            if (!InArena)
                Expedition?.DrawMinimap();
        }
    }
}
