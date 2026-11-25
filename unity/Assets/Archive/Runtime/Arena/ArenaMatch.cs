using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Archive.Arena
{
    public enum MatchPhase
    {
        Playing,
        BetweenRounds,
        Complete
    }
    public sealed class ArenaMatch
    {
        readonly JObject rule;
        public readonly string Kind;
        public int Round { get; private set; }
        public int Wins { get; private set; }
        public int Losses { get; private set; }
        public int Kills { get; private set; }
        public int Deaths { get; private set; }
        public int RoundKills { get; private set; }
        public float TimeLeft { get; private set; }
        public string Objective { get; private set; }
        public float Remaining { get; private set; }
        public float Defuse { get; private set; }
        public string Reason { get; private set; }
        public bool Won { get; private set; }
        public MatchPhase Phase { get; private set; }
        public int Target => (int?)rule["target"] ?? (int)rule["roundsToWin"];
        public bool ShopTime => Phase == MatchPhase.Playing &&
                                TimeLeft > (float)rule["timeLimit"] - 25 && Objective == null;
        public ArenaMatch(JObject definition)
        {
            rule = definition;
            Kind = (string)rule["kind"];
            BeginRound();
        }
        void BeginRound()
        {
            Round++;
            Phase = MatchPhase.Playing;
            TimeLeft = (float)rule["timeLimit"];
            Objective = null;
            Defuse = Remaining = 0;
            Reason = null;
            RoundKills = 0;
        }
        public void NextRound()
        {
            if (Phase == MatchPhase.BetweenRounds)
                BeginRound();
        }
        public void ObjectiveReached(string id)
        {
            if (Phase != MatchPhase.Playing || Objective != null)
                return;
            switch (Kind)
            {
            case "ward" when id == "west-ward" || id == "east-ward":
                Objective = id;
                Remaining = (float)rule["holdSeconds"];
                break;
            case "bomb" when id == "site-a" || id == "site-b":
                Objective = id;
                Remaining = (float)rule["fuseSeconds"];
                break;
            case "rescue" when id == "hostage":
                Objective = id;
                break;
            }
        }
        public void Kill()
        {
            if (Phase != MatchPhase.Playing)
                return;
            Kills++;
            RoundKills++;
            if (Kind == "score" && Kills >= Target)
                Finish(true, "score");
            else if (Kind == "elimination" && RoundKills >= (int)rule["enemies"])
                Finish(true, "eliminated");
        }
        public bool Fall()
        {
            if (Phase != MatchPhase.Playing)
                return false;
            Deaths++;
            if (Kind == "score")
                return true;
            Finish(false, "defeated");
            return false;
        }
        public void LoseHostage()
        {
            if (Kind == "rescue" && Phase == MatchPhase.Playing)
                Finish(false, "hostage-lost");
        }
        public void Tick(float dt, bool contested, bool extracted)
        {
            if (Phase != MatchPhase.Playing || dt <= 0)
                return;
            float step = Mathf.Min(dt, Kind == "bomb" && Objective != null ? Remaining : TimeLeft);
            TimeLeft = Mathf.Max(0, TimeLeft - step);
            if (Objective != null)
            {
                if (Kind == "bomb")
                {
                    Defuse = contested ? Defuse + step : 0;
                    Remaining = Mathf.Max(0, Remaining - step);
                    if (Defuse >= (float)rule["defuseSeconds"])
                        Finish(false, "defused");
                    else if (Remaining <= 0)
                        Finish(true, "detonated");
                    return;
                }
                if (Kind == "ward" && !contested)
                {
                    Remaining = Mathf.Max(0, Remaining - step);
                    if (Remaining <= 0)
                    {
                        Finish(true, "sealed");
                        return;
                    }
                }
                if (Kind == "rescue" && extracted)
                {
                    Finish(true, "rescued");
                    return;
                }
            }
            if (TimeLeft <= 0)
                Finish(false, "timeout");
        }
        void Finish(bool win, string why)
        {
            Won = win;
            Reason = why;
            if (win)
                Wins++;
            else
                Losses++;
            Phase = Kind == "score" || Mathf.Max(Wins, Losses) >= Target ? MatchPhase.Complete
                                                                         : MatchPhase.BetweenRounds;
        }
    }
}
