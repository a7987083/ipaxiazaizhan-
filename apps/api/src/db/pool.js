// 2026091208+: runtime data no longer depends on PostgreSQL.
// Application records are read directly from configured MySQL software sources,
// while the small ZONOE control plane is stored under data/control.
export const pool={query(){throw new Error('PostgreSQL pool is no longer used')},end:async()=>{}};
export const query=()=>{throw new Error('PostgreSQL query is no longer used')};
export const tx=()=>{throw new Error('PostgreSQL transaction is no longer used')};
