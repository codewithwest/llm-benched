import { useState, useEffect, useCallback, useRef } from 'react';
import { Gauge, Play, Copy, Check, Download, ArrowLeft, RefreshCw, BarChart3 } from 'lucide-react';
import Select from './Select';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

type View = 'list' | 'form' | 'detail';

interface BenchmarkRun {
  id: number;
  created_at: string;
  model: string;
  target_url: string;
  num_predict: number;
  config_json: string;
  status: string;
}

interface BenchmarkResult {
  id: number;
  run_id: number;
  test_type: string;
  context_multiplier: number;
  parallel_users: number;
  prompt_tokens: number;
  prompt_eval_duration_ns: number;
  eval_count: number;
  eval_duration_ns: number;
  wall_time_ms: number;
}

interface RunDetail {
  id: number;
  created_at: string;
  model: string;
  target_url: string;
  num_predict: number;
  config_json: string;
  status: string;
  results: BenchmarkResult[];
}

const defaultConfig = {
  model: '',
  target_url: 'http://127.0.0.1:11434/api/generate',
  num_predict: 100,
  context_multipliers: '25, 50, 100, 150, 200, 250, 300, 350, 400',
  parallel_users: '1, 2, 4, 8',
  run_context_scaling: true,
  run_parallel_scaling: true,
  run_combined: true,
};

function fmtMs(ms: number): string {
  if (ms >= 10000) return (ms / 1000).toFixed(1) + 's';
  return ms + 'ms';
}

function fmtTPS(val: number): string {
  if (val === 0) return '—';
  return val.toFixed(1);
}

function genLLMSummary(run: RunDetail): string {
  const ctx = run.results.filter(r => r.test_type === 'context_scaling');
  const par = run.results.filter(r => r.test_type === 'parallel_scaling');
  const comb = run.results.filter(r => r.test_type === 'combined');

  let s = `## Benchmark Report: ${run.model}\n`;
  s += `- Run ID: #${run.id}\n`;
  s += `- Date: ${new Date(run.created_at).toLocaleString()}\n`;
  s += `- Target: ${run.target_url}\n`;
  s += `- Status: ${run.status}\n\n`;

  if (ctx.length > 0) {
    s += '### Context Scaling\n';
    s += '| Tokens | Prompt TPS | Gen TPS | Wall Time |\n';
    s += '|--------|------------|---------|-----------|\n';
    for (const r of ctx) {
      const ptps = r.prompt_eval_duration_ns > 0
        ? (r.prompt_tokens / (r.prompt_eval_duration_ns / 1e9)).toFixed(1)
        : '—';
      const gtps = r.eval_duration_ns > 0
        ? (r.eval_count / (r.eval_duration_ns / 1e9)).toFixed(1)
        : '—';
      s += `| ${r.prompt_tokens} | ${ptps} | ${gtps} | ${fmtMs(r.wall_time_ms)} |\n`;
    }
    s += '\n';
  }

  if (par.length > 0) {
    const byUsers: Record<number, number[]> = {};
    for (const r of par) {
      if (!byUsers[r.parallel_users]) byUsers[r.parallel_users] = [];
      byUsers[r.parallel_users].push(r.wall_time_ms);
    }
    s += '### Parallel Scaling\n';
    s += '| Users | Requests | Avg Time | Max Time |\n';
    s += '|-------|----------|----------|----------|\n';
    for (const [u, times] of Object.entries(byUsers).sort((a, b) => Number(a[0]) - Number(b[0]))) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const mx = Math.max(...times);
      s += `| ${u} | ${times.length} | ${fmtMs(avg)} | ${fmtMs(mx)} |\n`;
    }
    s += '\n';
  }

  if (comb.length > 0) {
    s += '### Combined Matrix (Users × Context)\n';
    s += '| Users | Tokens | Avg Time |\n';
    s += '|-------|--------|----------|\n';
    const grouped: Record<string, { users: number; tokens: number; times: number[] }> = {};
    for (const r of comb) {
      const key = `${r.parallel_users}-${r.context_multiplier}`;
      if (!grouped[key]) grouped[key] = { users: r.parallel_users, tokens: r.context_multiplier * 100, times: [] };
      grouped[key].times.push(r.wall_time_ms);
    }
    for (const g of Object.values(grouped).sort((a, b) => a.users - b.users || a.tokens - b.tokens)) {
      const avg = g.times.reduce((a, b) => a + b, 0) / g.times.length;
      s += `| ${g.users} | ~${g.tokens} | ${fmtMs(avg)} |\n`;
    }
    s += '\n';
  }

  s += '---\nBased on the data above, analyze performance bottlenecks and recommend optimizations.\n';
  return s;
}

function exportCSV(run: RunDetail): void {
  const rows = run.results.map(r => [
    r.test_type,
    r.context_multiplier,
    r.parallel_users,
    r.prompt_tokens,
    r.prompt_eval_duration_ns,
    r.eval_count,
    r.eval_duration_ns,
    r.wall_time_ms,
  ]);
  const header = 'test_type,context_multiplier,parallel_users,prompt_tokens,prompt_eval_duration_ns,eval_count,eval_duration_ns,wall_time_ms\n';
  const csv = header + rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `benchmark-run-${run.id}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON(run: RunDetail): void {
  const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `benchmark-run-${run.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0E1320] border border-[#222B3D] text-[10px] font-mono text-[#7B8AA0] hover:text-[#F8FAFC] hover:border-[#FF00FF]/50 transition-all"
    >
      {copied ? <Check className="w-3 h-3 text-[#00FFA3]" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy Report'}
    </button>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-[#05070D] border border-[#222B3D]/60 p-4">
      <div className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] mb-1">{label}</div>
      <div className="text-lg font-bold text-[#F8FAFC] font-mono">{value}</div>
      {sub && <div className="text-[9px] text-[#7B8AA0]/60 mt-0.5 font-mono">{sub}</div>}
    </div>
  );
}

function RunForm({ onStart, models, defaultTarget }: { onStart: (cfg: typeof defaultConfig) => void; models: string[]; defaultTarget: string }) {
  const [cfg, setCfg] = useState({ ...defaultConfig, target_url: defaultTarget });
  useEffect(() => {
    if (!cfg.model && models.length > 0) setCfg(c => ({ ...c, model: models[0] }));
  }, [models]);
  useEffect(() => {
    setCfg(c => ({ ...c, target_url: defaultTarget }));
  }, [defaultTarget]);
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] block mb-1.5">Model</label>
          <select value={cfg.model} onChange={e => setCfg({ ...cfg, model: e.target.value })}
            className="w-full bg-[#05070D] border border-[#222B3D] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FF00FF]/50 text-[#F8FAFC] font-mono appearance-none cursor-pointer">
            {models.length === 0 && <option value="">No models available</option>}
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] block mb-1.5">Target URL</label>
          <input type="text" value={cfg.target_url} onChange={e => setCfg({ ...cfg, target_url: e.target.value })}
            className="w-full bg-[#05070D] border border-[#222B3D] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FF00FF]/50 text-[#F8FAFC] font-mono placeholder:text-[#7B8AA0]/40" />
        </div>
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] block mb-1.5">Num Predict</label>
          <input type="number" value={cfg.num_predict} onChange={e => setCfg({ ...cfg, num_predict: Number(e.target.value) })}
            className="w-full bg-[#05070D] border border-[#222B3D] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FF00FF]/50 text-[#F8FAFC] font-mono placeholder:text-[#7B8AA0]/40" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] block mb-1.5">Context Multipliers (comma-sep)</label>
          <input type="text" value={cfg.context_multipliers} onChange={e => setCfg({ ...cfg, context_multipliers: e.target.value })}
            className="w-full bg-[#05070D] border border-[#222B3D] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FF00FF]/50 text-[#F8FAFC] font-mono" />
        </div>
        <div>
          <label className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] block mb-1.5">Parallel Users (comma-sep)</label>
          <input type="text" value={cfg.parallel_users} onChange={e => setCfg({ ...cfg, parallel_users: e.target.value })}
            className="w-full bg-[#05070D] border border-[#222B3D] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FF00FF]/50 text-[#F8FAFC] font-mono" />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-xs font-mono text-[#7B8AA0] cursor-pointer">
          <input type="checkbox" checked={cfg.run_context_scaling} onChange={e => setCfg({ ...cfg, run_context_scaling: e.target.checked })}
            className="accent-[#FF00FF]" />
          Context Scaling
        </label>
        <label className="flex items-center gap-2 text-xs font-mono text-[#7B8AA0] cursor-pointer">
          <input type="checkbox" checked={cfg.run_parallel_scaling} onChange={e => setCfg({ ...cfg, run_parallel_scaling: e.target.checked })}
            className="accent-[#FF00FF]" />
          Parallel Scaling
        </label>
        <label className="flex items-center gap-2 text-xs font-mono text-[#7B8AA0] cursor-pointer">
          <input type="checkbox" checked={cfg.run_combined} onChange={e => setCfg({ ...cfg, run_combined: e.target.checked })}
            className="accent-[#FF00FF]" />
          Combined Matrix
        </label>
      </div>
      <button
        onClick={() => onStart(cfg)}
        className="px-8 py-3 bg-[#FF00FF] text-black rounded-xl hover:bg-white transition-all duration-250 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-40"
      >
        <Play className="w-4 h-4" /> Run Benchmark
      </button>
    </div>
  );
}

export default function BenchmarkPanel() {
  const [view, setView] = useState<View>('list');
  const [runs, setRuns] = useState<BenchmarkRun[]>([]);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [defaultTarget, setDefaultTarget] = useState('http://127.0.0.1:11434/api/generate');
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [compareData, setCompareData] = useState<RunDetail[]>([]);
  const [showSchedules, setShowSchedules] = useState(false);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [showScheduleForm, setShowScheduleForm] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({ model: '', target_url: '', cron_expr: '@every_5m' });
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/benchmark/runs');
      if (res.ok) setRuns(await res.json());
    } catch {}
  }, []);

  useEffect(() => { fetchRuns(); }, [fetchRuns]);

  useEffect(() => {
    (async () => {
      try {
        const [modRes, provRes] = await Promise.all([
          fetch('/api/dashboard/models').catch(() => null),
          fetch('/api/dashboard/providers').catch(() => null),
        ]);
        if (modRes) {
          const d = await modRes.json();
          if (d.models?.length) setModels(d.models);
        }
        if (provRes) {
          const d = await provRes.json();
          if (d.providers?.length) {
            const p = d.providers[0];
            setDefaultTarget(p.url + '/api/generate');
          }
        }
      } catch {}
    })();
  }, []);

  const fetchDetail = useCallback(async (id: number) => {
    try {
      const res = await fetch(`/api/benchmark/runs/${id}`);
      if (res.ok) {
        const d = await res.json();
        setDetail(d);
        if (d.status === 'running' || d.status === 'pending') return; // keep polling
      }
    } catch {}
  }, []);

  const startPolling = (id: number) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/benchmark/runs/${id}`);
        if (res.ok) {
          const d = await res.json();
          setDetail(d);
          if (d.status === 'completed' || d.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            fetchRuns();
          }
        }
      } catch {}
    }, 2000);
  };

  const handleStart = async (cfg: typeof defaultConfig) => {
    try {
      const parseCSV = (s: string) => s.split(',').map(x => parseInt(x.trim())).filter(n => !isNaN(n));
      const res = await fetch('/api/benchmark/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.model,
          target_url: cfg.target_url,
          num_predict: cfg.num_predict,
          context_multipliers: parseCSV(cfg.context_multipliers),
          parallel_users: parseCSV(cfg.parallel_users),
          run_context_scaling: cfg.run_context_scaling,
          run_parallel_scaling: cfg.run_parallel_scaling,
          run_combined: cfg.run_combined,
        }),
      });
      if (!res.ok) return;
      const { run_id } = await res.json();
      setView('detail');
      setDetail({ id: run_id, created_at: '', model: cfg.model, target_url: cfg.target_url, num_predict: cfg.num_predict, config_json: '', status: 'running', results: [] });
      startPolling(run_id);
      fetchRuns();
    } catch {}
  };

  const handleView = (id: number) => {
    setView('detail');
    setDetail(null);
    fetchDetail(id);
    startPolling(id);
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/benchmark/runs/${id}`, { method: 'DELETE' });
    if (detail?.id === id) { setView('list'); setDetail(null); }
    fetchRuns();
  };

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/schedules');
      if (res.ok) setSchedules(await res.json());
    } catch {}
  }, []);

  const handleCompare = async () => {
    if (compareIds.length !== 2) return;
    const [d1, d2] = await Promise.all(
      compareIds.map(id => fetch(`/api/benchmark/runs/${id}`).then(r => r.json()))
    );
    setCompareData([d1, d2]);
    setView('detail');
    setDetail(null);
  };

  useEffect(() => { fetchSchedules(); }, [fetchSchedules]);
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  if (view === 'form') {
    return (
      <section className="rounded-3xl bg-[#0E1320]/60 border border-[#222B3D]/60 p-6">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setView('list')} className="p-2 rounded-lg hover:bg-[#222B3D]/60 transition-colors">
            <ArrowLeft className="w-4 h-4 text-[#7B8AA0]" />
          </button>
          <Gauge className="w-4 h-4 text-[#FF00FF]" />
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#7B8AA0]">New Benchmark</h2>
        </div>
        <RunForm onStart={handleStart} models={models} defaultTarget={defaultTarget} />
      </section>
    );
  }

  if (view === 'detail') {
    if (!detail) return <div className="text-[#7B8AA0] text-xs font-mono py-20 text-center">Loading...</div>;

    if (compareData.length === 2) {
      const [r1, r2] = compareData;
      const llm1 = genLLMSummary(r1);
      const llm2 = genLLMSummary(r2);
      return (
        <section className="rounded-3xl bg-[#0E1320]/60 border border-[#222B3D]/60 p-6">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => { setView('list'); setCompareData([]); }} className="p-2 rounded-lg hover:bg-[#222B3D]/60 transition-colors">
              <ArrowLeft className="w-4 h-4 text-[#7B8AA0]" />
            </button>
            <BarChart3 className="w-4 h-4 text-[#FF00FF]" />
            <h2 className="text-xs font-semibold text-[#F8FAFC]">Compare: #{r1.id} vs #{r2.id}</h2>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="text-[10px] font-bold uppercase text-[#FF00FF] mb-3">Run #{r1.id} — {r1.model}</h3>
              <pre className="bg-[#05070D] border border-[#222B3D]/60 rounded-xl p-4 text-[10px] font-mono text-[#F8FAFC]/80 max-h-[400px] overflow-y-auto whitespace-pre-wrap">{llm1}</pre>
            </div>
            <div>
              <h3 className="text-[10px] font-bold uppercase text-[#00FFA3] mb-3">Run #{r2.id} — {r2.model}</h3>
              <pre className="bg-[#05070D] border border-[#222B3D]/60 rounded-xl p-4 text-[10px] font-mono text-[#F8FAFC]/80 max-h-[400px] overflow-y-auto whitespace-pre-wrap">{llm2}</pre>
            </div>
          </div>
        </section>
      );
    }

    const ctxResults = detail.results.filter(r => r.test_type === 'context_scaling');
    const parResults = detail.results.filter(r => r.test_type === 'parallel_scaling');
    const combResults = detail.results.filter(r => r.test_type === 'combined');
    const isRunning = detail.status === 'running' || detail.status === 'pending';

    const ctxChartData = ctxResults.map(r => ({
      tokens: r.prompt_tokens,
      promptTPS: r.prompt_eval_duration_ns > 0 ? parseFloat((r.prompt_tokens / (r.prompt_eval_duration_ns / 1e9)).toFixed(1)) : 0,
      genTPS: r.eval_duration_ns > 0 ? parseFloat((r.eval_count / (r.eval_duration_ns / 1e9)).toFixed(1)) : 0,
      wallMs: r.wall_time_ms,
    }));

    const parGrouped: Record<number, number[]> = {};
    for (const r of parResults) {
      if (!parGrouped[r.parallel_users]) parGrouped[r.parallel_users] = [];
      parGrouped[r.parallel_users].push(r.wall_time_ms);
    }
    const parChartData = Object.entries(parGrouped).sort((a, b) => Number(a[0]) - Number(b[0])).map(([u, times]) => ({
      users: Number(u),
      avgTime: parseFloat((times.reduce((a, b) => a + b, 0) / times.length / 1000).toFixed(2)),
      maxTime: parseFloat((Math.max(...times) / 1000).toFixed(2)),
      count: times.length,
    }));

    const llmSummary = genLLMSummary(detail);

    return (
      <section className="rounded-3xl bg-[#0E1320]/60 border border-[#222B3D]/60 flex flex-col max-h-[calc(100vh-180px)]">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={() => { setView('list'); setDetail(null); if (pollRef.current) clearInterval(pollRef.current); }} className="p-2 rounded-lg hover:bg-[#222B3D]/60 transition-colors">
              <ArrowLeft className="w-4 h-4 text-[#7B8AA0]" />
            </button>
            <Gauge className="w-4 h-4 text-[#FF00FF]" />
            <h2 className="text-xs font-semibold text-[#F8FAFC]">Run #{detail.id} · {detail.model}</h2>
            <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${isRunning ? 'text-[#FFD700] bg-[#FFD700]/10 animate-pulse' : detail.status === 'completed' ? 'text-[#00FFA3] bg-[#00FFA3]/10' : 'text-red-400 bg-red-400/10'}`}>
              {detail.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CopyButton text={llmSummary} />
            <button onClick={() => exportCSV(detail)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0E1320] border border-[#222B3D] text-[10px] font-mono text-[#7B8AA0] hover:text-[#F8FAFC] hover:border-[#FF00FF]/50 transition-all">
              <Download className="w-3 h-3" /> CSV
            </button>
            <button onClick={() => exportJSON(detail)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0E1320] border border-[#222B3D] text-[10px] font-mono text-[#7B8AA0] hover:text-[#F8FAFC] hover:border-[#FF00FF]/50 transition-all">
              <Download className="w-3 h-3" /> JSON
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 pb-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <KPI label="Total Requests" value={String(detail.results.length)} />
          <KPI label="Context Tests" value={String(ctxResults.length)} sub={ctxResults.length > 0 ? `up to ${ctxResults[ctxResults.length-1]?.prompt_tokens || '—'} tokens` : undefined} />
          <KPI label="Parallel Tests" value={String(parChartData.length)} sub={parChartData.length > 0 ? `up to ${parChartData[parChartData.length-1]?.users} users` : undefined} />
          <KPI label="Combined Tests" value={String(combResults.length)} />
        </div>

        {/* Context Scaling */}
        {ctxResults.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#7B8AA0] mb-3">Context Scaling</h3>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-[11px] font-mono">
                <thead><tr className="text-[#7B8AA0] text-[9px] uppercase tracking-wider">
                  <th className="text-left px-3 py-2">Tokens</th>
                  <th className="text-right px-3 py-2">Prompt TPS</th>
                  <th className="text-right px-3 py-2">Gen TPS</th>
                  <th className="text-right px-3 py-2">Wall Time</th>
                </tr></thead>
                <tbody>
                  {ctxResults.map(r => (
                    <tr key={r.id} className="border-t border-[#222B3D]/40 hover:bg-[#151C2E]/40">
                      <td className="px-3 py-2 text-[#F8FAFC]">{r.prompt_tokens}</td>
                      <td className="px-3 py-2 text-right text-[#FF00FF]">{fmtTPS(r.prompt_tokens / (r.prompt_eval_duration_ns / 1e9))}</td>
                      <td className="px-3 py-2 text-right text-[#00FFA3]">{fmtTPS(r.eval_count / (r.eval_duration_ns / 1e9))}</td>
                      <td className="px-3 py-2 text-right text-[#7B8AA0]">{fmtMs(r.wall_time_ms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ctxChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222B3D" vertical={false} />
                  <XAxis dataKey="tokens" stroke="#7B8AA0" fontSize={10} tickMargin={8} axisLine={false} tickLine={false} />
                  <YAxis stroke="#7B8AA0" fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#05070D', borderColor: '#FF00FF', borderRadius: '12px', color: '#F8FAFC' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Line type="monotone" dataKey="promptTPS" stroke="#FF00FF" strokeWidth={2} name="Prompt TPS" dot={false} />
                  <Line type="monotone" dataKey="genTPS" stroke="#00FFA3" strokeWidth={2} name="Gen TPS" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Parallel Scaling */}
        {parChartData.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#7B8AA0] mb-3">Parallel Scaling</h3>
            <div className="overflow-x-auto mb-4">
              <table className="w-full text-[11px] font-mono">
                <thead><tr className="text-[#7B8AA0] text-[9px] uppercase tracking-wider">
                  <th className="text-left px-3 py-2">Users</th>
                  <th className="text-right px-3 py-2">Requests</th>
                  <th className="text-right px-3 py-2">Avg Time</th>
                  <th className="text-right px-3 py-2">Max Time</th>
                </tr></thead>
                <tbody>
                  {parChartData.map(d => (
                    <tr key={d.users} className="border-t border-[#222B3D]/40 hover:bg-[#151C2E]/40">
                      <td className="px-3 py-2 text-[#F8FAFC]">{d.users}</td>
                      <td className="px-3 py-2 text-right text-[#7B8AA0]">{d.count}</td>
                      <td className="px-3 py-2 text-right text-[#FF00FF]">{d.avgTime.toFixed(1)}s</td>
                      <td className="px-3 py-2 text-right text-[#FFD700]">{d.maxTime.toFixed(1)}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={parChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222B3D" vertical={false} />
                  <XAxis dataKey="users" stroke="#7B8AA0" fontSize={10} tickMargin={8} axisLine={false} tickLine={false} />
                  <YAxis stroke="#7B8AA0" fontSize={10} axisLine={false} tickLine={false} unit="s" />
                  <Tooltip contentStyle={{ backgroundColor: '#05070D', borderColor: '#FF00FF', borderRadius: '12px', color: '#F8FAFC' }} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                  <Bar dataKey="avgTime" fill="#FF00FF" name="Avg Time" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="maxTime" fill="#FFD700" name="Max Time" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Combined Matrix */}
        {combResults.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#7B8AA0] mb-3">Combined Matrix</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] font-mono">
                <thead><tr className="text-[#7B8AA0] text-[9px] uppercase tracking-wider">
                  <th className="text-left px-3 py-2">Users</th>
                  <th className="text-left px-3 py-2">Tokens</th>
                  <th className="text-right px-3 py-2">Avg Time</th>
                </tr></thead>
                <tbody>
                  {(() => {
                    const grouped: Record<string, { users: number; tokens: number; times: number[] }> = {};
                    for (const r of combResults) {
                      const key = `${r.parallel_users}-${r.context_multiplier}`;
                      if (!grouped[key]) grouped[key] = { users: r.parallel_users, tokens: r.context_multiplier * 100, times: [] };
                      grouped[key].times.push(r.wall_time_ms);
                    }
                    return Object.values(grouped).sort((a, b) => a.users - b.users || a.tokens - b.tokens).map(g => (
                      <tr key={`${g.users}-${g.tokens}`} className="border-t border-[#222B3D]/40 hover:bg-[#151C2E]/40">
                        <td className="px-3 py-2 text-[#F8FAFC]">{g.users}</td>
                        <td className="px-3 py-2 text-[#7B8AA0]">~{g.tokens}</td>
                        <td className="px-3 py-2 text-right text-[#FF00FF]">{fmtMs(g.times.reduce((a, b) => a + b, 0) / g.times.length)}</td>
                      </tr>
                    ));
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* LLM Summary */}
        {!isRunning && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#7B8AA0]">LLM Summary</h3>
              <CopyButton text={llmSummary} />
            </div>
            <pre className="bg-[#05070D] border border-[#222B3D]/60 rounded-xl p-4 text-[11px] font-mono text-[#F8FAFC]/80 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap">
              {llmSummary}
            </pre>
          </div>
        )}

        {isRunning && (
          <div className="flex items-center justify-center py-12 text-[#7B8AA0] text-xs font-mono gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            Benchmark running — results appear as they complete
          </div>
        )}
        </div>
      </section>
    );
  }

  const handleCreateSchedule = async () => {
    try {
      await fetch('/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: scheduleForm.model || models[0] || 'model',
          target_url: scheduleForm.target_url || defaultTarget,
          cron_expr: scheduleForm.cron_expr,
          config_json: JSON.stringify({ model: scheduleForm.model || models[0] || 'model', target_url: scheduleForm.target_url || defaultTarget }),
        }),
      });
      setShowScheduleForm(false);
      fetchSchedules();
    } catch {}
  };

  // List view
  return (
    <section className="rounded-3xl bg-[#0E1320]/60 border border-[#222B3D]/60 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="w-4 h-4 text-[#FF00FF]" />
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#7B8AA0]">Benchmark Runs</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowSchedules(!showSchedules)} className={`px-3 py-1.5 rounded-lg border text-[10px] font-mono transition-all ${showSchedules ? 'bg-[#FF00FF]/10 border-[#FF00FF]/50 text-[#FF00FF]' : 'bg-[#0E1320] border-[#222B3D] text-[#7B8AA0] hover:text-[#F8FAFC]'}`}>
            Schedules
          </button>
          <div className="flex rounded-lg overflow-hidden border border-[#222B3D]">
            <button onClick={() => setViewMode('list')} className={`px-2.5 py-1.5 text-[10px] font-mono transition-all ${viewMode === 'list' ? 'bg-[#FF00FF] text-black' : 'bg-[#0E1320] text-[#7B8AA0] hover:text-[#F8FAFC]'}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
            </button>
            <button onClick={() => setViewMode('grid')} className={`px-2.5 py-1.5 text-[10px] font-mono transition-all ${viewMode === 'grid' ? 'bg-[#FF00FF] text-black' : 'bg-[#0E1320] text-[#7B8AA0] hover:text-[#F8FAFC]'}`}>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" /></svg>
            </button>
          </div>
          {compareIds.length === 2 && (
            <button onClick={handleCompare} className="px-3 py-1.5 rounded-lg bg-[#FF00FF]/20 border border-[#FF00FF]/50 text-[#FF00FF] text-[10px] font-mono animate-pulse">
              Compare 2 runs
            </button>
          )}
          <button onClick={fetchRuns} className="p-2 rounded-lg bg-[#0E1320] border border-[#222B3D] text-[#7B8AA0] hover:text-[#F8FAFC] hover:border-[#FF00FF]/50 transition-all" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setView('form')} className="px-4 py-2 bg-[#FF00FF] text-black rounded-xl hover:bg-white transition-all text-[10px] font-bold uppercase tracking-widest flex items-center gap-1.5 active:scale-[0.98]">
            <Play className="w-3 h-3" /> New Benchmark
          </button>
        </div>
      </div>

      {/* Schedules section */}
      {showSchedules && (
        <div className="mb-6 rounded-2xl bg-[#05070D] border border-[#222B3D]/60 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#7B8AA0]">Scheduled Benchmarks</h3>
            <button onClick={() => setShowScheduleForm(!showScheduleForm)} className="text-[10px] font-mono text-[#FF00FF] hover:underline">
              {showScheduleForm ? 'Cancel' : '+ Add'}
            </button>
          </div>
          {showScheduleForm && (
            <div className="flex items-center gap-2 mb-3">
              <div className="w-32">
                <Select
                  value={scheduleForm.model}
                  onChange={v => setScheduleForm({ ...scheduleForm, model: v })}
                  options={models.map(m => ({ value: m, label: m }))}
                  placeholder="Model"
                />
              </div>
              <div className="w-28">
                <Select
                  value={scheduleForm.cron_expr}
                  onChange={v => setScheduleForm({ ...scheduleForm, cron_expr: v })}
                  options={[
                    { value: '@every_5m', label: 'Every 5m' },
                    { value: '@every_15m', label: 'Every 15m' },
                    { value: '@every_30m', label: 'Every 30m' },
                    { value: '@hourly', label: 'Hourly' },
                    { value: '@daily', label: 'Daily' },
                  ]}
                  placeholder="Interval"
                />
              </div>
              <button onClick={handleCreateSchedule} className="px-3 py-1.5 bg-[#FF00FF] text-black rounded-lg text-[10px] font-mono font-bold">Save</button>
            </div>
          )}
          {schedules.length === 0 ? (
            <p className="text-[10px] font-mono text-[#7B8AA0]/60">No schedules configured</p>
          ) : (
            <div className="space-y-1">
              {schedules.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between rounded-lg bg-[#0E1320] px-3 py-2">
                  <div className="flex items-center gap-3 text-[10px] font-mono">
                    <span className="text-[#F8FAFC]">{s.model}</span>
                    <span className="text-[#7B8AA0]">{s.cron_expr}</span>
                    {s.last_run_status && <span className={`px-1.5 py-0.5 rounded text-[9px] ${s.last_run_status === 'completed' ? 'text-[#00FFA3] bg-[#00FFA3]/10' : 'text-red-400 bg-red-400/10'}`}>{s.last_run_status}</span>}
                  </div>
                  <button onClick={async () => { await fetch(`/api/schedules/${s.id}`, { method: 'DELETE' }); fetchSchedules(); }} className="text-red-400 hover:underline text-[10px] font-mono">×</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {runs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-[#7B8AA0]">
          <Gauge className="w-10 h-10 mb-4 opacity-50" />
          <p className="text-xs font-mono">No benchmark runs yet</p>
          <button onClick={() => setView('form')} className="mt-4 px-5 py-2 bg-[#FF00FF]/20 text-[#FF00FF] rounded-xl hover:bg-[#FF00FF]/30 transition-all text-xs font-mono">
            Create your first benchmark
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {runs.map(run => (
            <div key={run.id} className="rounded-2xl bg-[#0E1320]/80 border border-[#222B3D]/40 p-4 hover:border-[#FF00FF]/30 transition-all group flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={compareIds.includes(run.id)}
                    onChange={() => setCompareIds(prev => prev.includes(run.id) ? prev.filter(id => id !== run.id) : prev.length < 2 ? [...prev, run.id] : [run.id, ...prev.slice(1)])}
                    className="accent-[#FF00FF] w-3 h-3" />
                  <div className="w-7 h-7 rounded-lg bg-[#FF00FF]/10 flex items-center justify-center">
                    <BarChart3 className="w-3.5 h-3.5 text-[#FF00FF]" />
                  </div>
                  <span className="text-[10px] font-mono text-[#FF00FF]/60">#{run.id}</span>
                </div>
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${run.status === 'running' ? 'text-[#FFD700] bg-[#FFD700]/10 animate-pulse' : run.status === 'completed' ? 'text-[#00FFA3] bg-[#00FFA3]/10' : 'text-red-400 bg-red-400/10'}`}>
                  {run.status}
                </span>
              </div>
              <div className="text-xs font-mono text-[#F8FAFC] font-bold mb-1">{run.model}</div>
              <div className="text-[9px] font-mono text-[#7B8AA0] truncate mb-2">{run.target_url}</div>
              <div className="text-[9px] font-mono text-[#7B8AA0]/60 mb-3">{new Date(run.created_at).toLocaleString()}</div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={() => handleView(run.id)} className="flex-1 text-center py-1 rounded-lg bg-[#0E1320] border border-[#222B3D] text-[10px] font-mono text-[#FF00FF] hover:border-[#FF00FF]/50 transition-all">View</button>
                <button onClick={() => handleDelete(run.id)} className="py-1 px-2 rounded-lg bg-[#0E1320] border border-[#222B3D] text-[10px] font-mono text-red-400 hover:border-red-400/50 transition-all">×</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {runs.map(run => (
            <div key={run.id} className="flex items-center justify-between rounded-2xl bg-[#0E1320]/80 border border-[#222B3D]/40 p-4 hover:border-[#FF00FF]/30 transition-all group">
              <div className="flex items-center gap-3">
                <input type="checkbox" checked={compareIds.includes(run.id)}
                  onChange={() => setCompareIds(prev => prev.includes(run.id) ? prev.filter(id => id !== run.id) : prev.length < 2 ? [...prev, run.id] : [run.id, ...prev.slice(1)])}
                  className="accent-[#FF00FF] w-3.5 h-3.5" />
                <div className="w-8 h-8 rounded-lg bg-[#FF00FF]/10 flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 text-[#FF00FF]" />
                </div>
                <div>
                  <div className="text-xs font-mono text-[#F8FAFC] font-bold">{run.model}</div>
                  <div className="text-[10px] font-mono text-[#7B8AA0]">
                    #{run.id} · {new Date(run.created_at).toLocaleString()} · {run.target_url}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${run.status === 'running' ? 'text-[#FFD700] bg-[#FFD700]/10 animate-pulse' : run.status === 'completed' ? 'text-[#00FFA3] bg-[#00FFA3]/10' : 'text-red-400 bg-red-400/10'}`}>
                  {run.status}
                </span>
                <button onClick={() => handleView(run.id)} className="text-[10px] font-mono text-[#FF00FF] hover:underline opacity-0 group-hover:opacity-100 transition-opacity">View</button>
                <button onClick={() => handleDelete(run.id)} className="text-[10px] font-mono text-red-400 hover:underline opacity-0 group-hover:opacity-100 transition-opacity">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
