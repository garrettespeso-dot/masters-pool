import React, { useEffect, useMemo, useState } from "react";
import { DEFAULT_PARTICIPANTS } from "./participants";

const BUCKETS = ["Bucket 1","Bucket 2","Bucket 3","Bucket 4","Bucket 5"];

function normalizeName(name) {
  return String(name || "")
    .replace(/\(a\)/gi, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace("jordon spieth","jordan spieth")
    .replace("sungae im","sungjae im")
    .replace("ludvig åberg","ludvig aberg")
    .replace("nicolai højgaard","nicolai hojgaard")
    .replace("j j spaun","jj spaun");
}

function flattenPicks(picks) {
  return BUCKETS.flatMap((b)=>picks[b]||[]);
}

const DEFAULT_PLAYERS = Array.from(
  new Map(
    DEFAULT_PARTICIPANTS.flatMap(entry =>
      flattenPicks(entry.picks).map(name => [
        normalizeName(name),
        { name, score: 0, madeCut: false }
      ])
    )
  ).values()
);

function computeEntry(entry, players) {
  const map = Object.fromEntries(players.map(p=>[normalizeName(p.name),p]));

  const selected = flattenPicks(entry.picks)
    .map(n=>map[normalizeName(n)])
    .filter(Boolean);

  const made = selected.filter(p=>p.madeCut);

  const scores = made
    .map(p=>Number(p.score))
    .filter(n=>!Number.isNaN(n))
    .sort((a,b)=>a-b);

  const best5 = scores.slice(0,5);
  const total = best5.length===5 ? best5.reduce((a,b)=>a+b,0) : null;
  const tiebreak = scores.length>=6 ? scores[5] : null;

  return {
    ...entry,
    madeCutCount: made.length,
    countedScores: best5,
    total,
    tiebreak,
    out: made.length<5
  };
}

export default function App() {
  const [players,setPlayers]=useState(DEFAULT_PLAYERS);
  const [status,setStatus]=useState("Loading...");
  const [last,setLast]=useState("");

  const leaderboard = useMemo(()=>{
    return DEFAULT_PARTICIPANTS
      .map(p=>computeEntry(p,players))
      .sort((a,b)=>{
        if(a.out!==b.out) return a.out?1:-1;
        if((a.total??999)!==(b.total??999)) return (a.total??999)-(b.total??999);
        return (a.tiebreak??999)-(b.tiebreak??999);
      });
  },[players]);

  useEffect(()=>{
    async function load(){
      try{
        setStatus("Updating...");
        const res = await fetch("/api/leaderboard");
        const data = await res.json();

        const map = new Map(
          data.players.map(p=>[normalizeName(p.name),p])
        );

        setPlayers(curr=>curr.map(p=>{
          const live = map.get(normalizeName(p.name));
          if(!live) return p;

          const ok = typeof live.score==="number" && live.score>=-20 && live.score<=20;

          return {
            ...p,
            score: ok ? live.score : p.score,
            madeCut: ok ? true : p.madeCut
          };
        }));

        setStatus("Live");
        setLast(new Date().toLocaleTimeString());
      }catch{
        setStatus("Error");
      }
    }

    load();
    const id=setInterval(load,60000);
    return ()=>clearInterval(id);
  },[]);

  return (
    <div style={{padding:20,fontFamily:"Arial"}}>
      <h1>Masters Pool</h1>
      <div>Status: {status} | Last: {last}</div>

      <table style={{width:"100%",marginTop:20,borderCollapse:"collapse"}}>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Participant</th>
            <th>Status</th>
            <th>Cut</th>
            <th>Total</th>
            <th>6th</th>
            <th>Scores</th>
          </tr>
        </thead>

        <tbody>
          {leaderboard.map((e,i)=>{
            const leader=i===0 && !e.out;
            return (
              <tr key={e.name} style={{background:leader?"#e8f5e9":"white"}}>
                <td>
                  {i===0?"🥇":i===1?"🥈":i===2?"🥉":""} #{i+1}
                </td>
                <td>{leader?"👑 ":""}{e.name}</td>
                <td>{e.out?"OUT":"ACTIVE"}</td>
                <td>{e.madeCutCount}</td>
                <td>{e.total??"—"}</td>
                <td>{e.tiebreak??"—"}</td>
                <td>{e.countedScores?.join(", ")||"—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
