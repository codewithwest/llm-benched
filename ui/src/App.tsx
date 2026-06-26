import { useState, useEffect, useRef } from 'react';
import { Activity, Send, X, Plus, Signal, BarChart3, Gauge, Cpu, Terminal, List, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

function Select({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full bg-[#0E1320] border border-[#222B3D] rounded-lg px-3 py-2 text-xs font-mono text-left transition-colors hover:border-[#FF00FF]/50 focus:border-[#FF00FF]/50 outline-none flex items-center justify-between gap-2"
      >
        <span className={selected ? 'text-[#F8FAFC]' : 'text-[#7B8AA0]/50'}>
          {selected ? selected.label : placeholder}
        </span>
        <svg className={`w-3 h-3 text-[#7B8AA0] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-[#151C2E] border border-[#222B3D] rounded-xl overflow-hidden z-[100] shadow-xl shadow-black/50">
          {options.length === 0 && (
            <div className="px-3 py-2.5 text-xs text-[#7B8AA0]/50 font-mono text-center">{placeholder}</div>
          )}
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full px-3 py-2 text-xs font-mono text-left transition-colors hover:bg-[#FF00FF]/10 ${
                value === opt.value ? 'text-[#FF00FF] bg-[#FF00FF]/5 font-bold' : 'text-[#F8FAFC]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Card({ s, onClick }: { s: any; onClick: () => void }) {
  const ts = new Date(s.timestamp);
  return (
    <div
      onClick={onClick}
      className="rounded-2xl bg-[#0E1320]/50 border border-[#222B3D]/40 p-4 hover:translate-x-1 hover:border-[#FF00FF]/30 transition-all duration-250 cursor-pointer group"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-[#FF00FF]/60">#{s.id}</span>
          <span className="text-xs font-mono bg-[#151C2E] px-2 py-0.5 rounded text-[#FF00FF]">{s.model_endpoint}</span>
        </div>
        <span className="text-[9px] font-mono text-[#7B8AA0]/60">{ts.toLocaleTimeString()}</span>
      </div>
      <div className="text-[11px] text-[#7B8AA0] font-mono truncate mb-3">{(s.prompt || '').substring(0, 120)}{(s.prompt || '').length > 120 ? '...' : ''}</div>
      <div className="flex items-center gap-4 text-xs">
        <div className="flex items-center gap-1">
          <Gauge className="w-3 h-3 text-[#FF00FF]" />
          <span className="font-mono text-[#F8FAFC] font-bold">{s.tps?.toFixed(1)}</span>
          <span className="text-[#7B8AA0]">TPS</span>
        </div>
        <div className="flex items-center gap-1">
          <Activity className="w-3 h-3 text-[#00FFA3]" />
          <span className="font-mono text-[#F8FAFC] font-bold">{(s.ttft_ns / 1_000_000).toFixed(0)}</span>
          <span className="text-[#7B8AA0]">ms</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[#F8FAFC] font-bold">{s.total_tokens}</span>
          <span className="text-[#7B8AA0]">tok</span>
        </div>
      </div>
    </div>
  );
}

function formatJSON(s: string): string {
  try {
    return JSON.stringify(JSON.parse(s), null, 2);
  } catch {
    return s;
  }
}

function DetailModal({ id, onClose }: { id: number; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/stats/${id}`)
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-[#0E1320] border border-[#222B3D]/80 rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-[0_30px_80px_rgba(0,0,0,0.5)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-[#222B3D]/60 flex items-center justify-between sticky top-0 bg-[#0E1320] z-10 rounded-t-3xl">
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-[#FF00FF]" />
            <h2 className="font-semibold text-sm text-[#F8FAFC]">Request #{id}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#222B3D]/60 transition-colors">
            <X className="w-4 h-4 text-[#7B8AA0]" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20 text-[#7B8AA0] text-xs font-mono">Loading...</div>
        )}

        {!loading && data && (
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-2xl bg-[#05070D] border border-[#222B3D]/60 p-4">
                <div className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] mb-1">TPS</div>
                <div className="text-lg font-bold text-[#FF00FF] font-mono">{data.tps?.toFixed(2)}</div>
              </div>
              <div className="rounded-2xl bg-[#05070D] border border-[#222B3D]/60 p-4">
                <div className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] mb-1">TTFT</div>
                <div className="text-lg font-bold text-[#00FFA3] font-mono">{(data.ttft_ns / 1_000_000).toFixed(0)} ms</div>
              </div>
              <div className="rounded-2xl bg-[#05070D] border border-[#222B3D]/60 p-4">
                <div className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] mb-1">Tokens</div>
                <div className="text-lg font-bold text-[#F8FAFC] font-mono">{data.total_tokens}</div>
              </div>
              <div className="rounded-2xl bg-[#05070D] border border-[#222B3D]/60 p-4">
                <div className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] mb-1">Model</div>
                <div className="text-lg font-bold text-[#F8FAFC] font-mono text-sm truncate">{data.model_endpoint}</div>
              </div>
            </div>

            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#7B8AA0] mb-2">Request JSON</h3>
              <pre className="bg-[#05070D] border border-[#222B3D]/60 rounded-xl p-4 text-[11px] font-mono text-[#F8FAFC]/80 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                {formatJSON(data.request_body || '')}
              </pre>
            </div>

            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#7B8AA0] mb-2">Response Body</h3>
              <pre className="bg-[#05070D] border border-[#222B3D]/60 rounded-xl p-4 text-[11px] font-mono text-[#F8FAFC]/80 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                {formatJSON(data.response_body || '')}
              </pre>
            </div>
          </div>
        )}

        {!loading && !data && (
          <div className="flex items-center justify-center py-20 text-[#7B8AA0] text-xs font-mono">Failed to load details</div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'requests' | 'providers'>('dashboard');
  const [stats, setStats] = useState<any[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [providers, setProviders] = useState<any[]>([]);

  const [selectedModel, setSelectedModel] = useState<string>('');
  const [activeProviderURL, setActiveProviderURL] = useState<string>('');
  const [filterEndpoint, setFilterEndpoint] = useState<string>('');

  const [providerName, setProviderName] = useState('');
  const [providerProtocol, setProviderProtocol] = useState<'http' | 'https'>('http');
  const [providerHost, setProviderHost] = useState('');
  const [providerPort, setProviderPort] = useState('11434');
  const [providerPath, setProviderPath] = useState('/api/generate');

  const providerPresets = [
    { label: 'Ollama', path: '/api/generate', port: '11434' },
    { label: 'llama.cpp / OpenAI', path: '/v1/chat/completions', port: '8080' },
  ];

  const applyPreset = (label: string) => {
    const preset = providerPresets.find((p) => p.label === label);
    if (preset) {
      setProviderPath(preset.path);
      setProviderPort(preset.port);
    }
  };

  const composeURL = (host: string, port: string, protocol: string, path: string) => {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${protocol}://${host}:${port}${cleanPath}`;
  };

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [detailId, setDetailId] = useState<number | null>(null);

  const fetchData = async () => {
    try {
      const [statRes, modRes, provRes] = await Promise.all([
        fetch('/api/dashboard/stats').catch(() => null),
        fetch('/api/dashboard/models').catch(() => null),
        fetch('/api/dashboard/providers').catch(() => null),
      ]);

      if (statRes) {
        const s = await statRes.json();
        setStats(s.benchmarks || []);
      }
      if (modRes) {
        const m = await modRes.json();
        setModels(m.models || []);
      }
      if (provRes) {
        const p = await provRes.json();
        setProviders(p.providers || []);
      }
      setLastUpdated(new Date().toLocaleTimeString());
    } catch {
      // silent
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!selectedModel && models.length > 0) {
      setSelectedModel(models[0]);
    }
  }, [models]);

  useEffect(() => {
    if (!activeProviderURL && providers.length > 0) {
      setActiveProviderURL(providers[0].url);
    }
  }, [providers]);

  const handleAddProvider = async () => {
    if (!providerName || !providerHost) return;
    const url = composeURL(providerHost, providerPort, providerProtocol, providerPath);
    try {
      const res = await fetch('/api/dashboard/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: providerName, url }),
      });
      if (!res.ok) {
        setToast('Failed to register node');
        setTimeout(() => setToast(null), 3000);
        return;
      }
      setProviderName('');
      setProviderHost('');
      setProviderPort('11434');
      setProviderProtocol('http');
      setProviderPath('/api/generate');
      fetchData();
      setToast('Node registered');
      setTimeout(() => setToast(null), 3000);
    } catch {
      setToast('Failed to register node');
      setTimeout(() => setToast(null), 3000);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || isStreaming) return;
    setIsStreaming(true);
    setMessages((prev) => prev + `\n\nUser: ${prompt}\nAI: `);
    const currentPrompt = prompt;
    setPrompt('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Target-Provider': activeProviderURL,
        },
        body: JSON.stringify({ model: selectedModel, prompt: currentPrompt, stream: true }),
      });

      if (!res.body) throw new Error('No response body');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((l) => l.trim() !== '');
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              setMessages((prev) => prev + parsed.response);
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch {
      setMessages((prev) => prev + `\n[Error: Connection failed]`);
    } finally {
      setIsStreaming(false);
    }
  };

  const filteredStats = stats.filter((s) => {
    if (filterEndpoint && s.model_endpoint !== filterEndpoint) return false;
    return true;
  });

  const recentStats = filteredStats.slice(0, 5);

  const onlineCount = providers.filter((p) => p.status === 'online').length;
  const avgTps = stats.length
    ? (stats.reduce((sum, s) => sum + s.tps, 0) / stats.length).toFixed(1)
    : '--';
  const avgTTFT = stats.length
    ? (stats.reduce((sum, s) => sum + s.ttft_ns, 0) / stats.length / 1_000_000).toFixed(0)
    : '--';

  const chartData = [...filteredStats].reverse().map((s) => ({
    time: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    tps: parseFloat(s.tps.toFixed(2)),
    ttft: s.ttft_ns / 1_000_000,
  }));

  const uniqueEndpoints = Array.from(new Set(stats.map((s) => s.model_endpoint).filter(Boolean)));

  function KPI({ title, value, icon }: { title: string; value: string | number; icon: React.ReactNode }) {
    return (
      <div className="rounded-3xl bg-gradient-to-br from-[#0E1320] to-black backdrop-blur-xl border border-[#222B3D]/60 p-5 transition-all duration-300 hover:border-[#FF00FF]/30 hover:shadow-[0_0_30px_rgba(255,0,255,0.06)]">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-[#7B8AA0]">{icon}</div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#7B8AA0]">{title}</span>
        </div>
        <div className="text-2xl font-bold text-[#F8FAFC] tracking-tight">{value}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#05070D] text-[#F8FAFC] font-sans flex flex-col overflow-x-hidden relative selection:bg-[#FF00FF]/30">

      {/* Living background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute left-0 top-0 w-[70vw] h-[70vw] bg-fuchsia-500/10 blur-[200px] animate-[pulse_14s_ease-in-out_infinite]" />
        <div className="absolute right-0 bottom-0 w-[50vw] h-[50vw] bg-cyan-500/10 blur-[250px] animate-[pulse_18s_ease-in-out_infinite]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent,#05070D)]" />
      </div>

      {/* Header */}
      <header className="relative z-50 px-8 py-4 border-b border-[#222B3D]/60 flex items-center justify-between bg-[#05070D]/80 backdrop-blur-xl sticky top-0">
        <div className="flex items-center gap-5">
          <div className="w-10 h-10 rounded-xl bg-[#FF00FF] flex items-center justify-center shadow-[0_0_20px_rgba(255,0,255,0.3)]">
            <BarChart3 className="text-black w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">Neural Operations Center</h1>
            <p className="text-[10px] text-[#7B8AA0] font-medium tracking-widest uppercase">Telemetry Interceptor</p>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-6">
          <div className="flex items-center gap-2 text-xs">
            <Signal className={`w-3.5 h-3.5 ${onlineCount > 0 ? 'text-[#00FFA3]' : 'text-[#7B8AA0]'}`} />
            <span className="text-[#7B8AA0] font-mono">{providers.length} Nodes</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Cpu className="w-3.5 h-3.5 text-[#7B8AA0]" />
            <span className="text-[#7B8AA0] font-mono">{models.length} Models</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Gauge className="w-3.5 h-3.5 text-[#7B8AA0]" />
            <span className="text-[#7B8AA0] font-mono">{avgTps} Avg TPS</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Activity className="w-3.5 h-3.5 text-[#7B8AA0]" />
            <span className="text-[#7B8AA0] font-mono">{avgTTFT} ms</span>
          </div>
        </div>

        <div className="w-44">
          <Select
            value={selectedModel}
            onChange={setSelectedModel}
            options={models.map((m) => ({ value: m, label: m }))}
            placeholder="No models"
          />
        </div>
      </header>

      {/* Tab bar */}
      <nav className="relative z-10 flex gap-1 px-6 pt-4 bg-[#05070D]/60 backdrop-blur-xl">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`px-5 py-2.5 rounded-t-xl text-xs font-semibold tracking-widest uppercase transition-all duration-250 flex items-center gap-2 ${
            activeTab === 'dashboard'
              ? 'bg-[#0E1320] text-[#FF00FF] border border-[#222B3D]/60 border-b-0'
              : 'text-[#7B8AA0] hover:text-[#F8FAFC] border border-transparent'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" /> Dashboard
        </button>
        <button
          onClick={() => setActiveTab('requests')}
          className={`px-5 py-2.5 rounded-t-xl text-xs font-semibold tracking-widest uppercase transition-all duration-250 flex items-center gap-2 ${
            activeTab === 'requests'
              ? 'bg-[#0E1320] text-[#FF00FF] border border-[#222B3D]/60 border-b-0'
              : 'text-[#7B8AA0] hover:text-[#F8FAFC] border border-transparent'
          }`}
        >
          <List className="w-3.5 h-3.5" /> Requests
          {filteredStats.length > 0 && (
            <span className="text-[9px] font-mono bg-[#FF00FF]/10 text-[#FF00FF] px-1.5 py-0.5 rounded-full">{filteredStats.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('providers')}
          className={`px-5 py-2.5 rounded-t-xl text-xs font-semibold tracking-widest uppercase transition-all duration-250 flex items-center gap-2 ${
            activeTab === 'providers'
              ? 'bg-[#0E1320] text-[#FF00FF] border border-[#222B3D]/60 border-b-0'
              : 'text-[#7B8AA0] hover:text-[#F8FAFC] border border-transparent'
          }`}
        >
          <Signal className="w-3.5 h-3.5" /> Providers
        </button>
      </nav>

      <main className="flex-1 px-6 pb-6 w-full">

        {/* Dashboard Tab */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <KPI title="Active Providers" value={onlineCount} icon={<Signal className="w-4 h-4" />} />
              <KPI title="Avg TPS" value={avgTps} icon={<Gauge className="w-4 h-4" />} />
              <KPI title="Avg TTFT" value={`${avgTTFT} ms`} icon={<Activity className="w-4 h-4" />} />
              <KPI title="Requests" value={filteredStats.length} icon={<BarChart3 className="w-4 h-4" />} />
            </div>

            <section className="rounded-3xl bg-[#0E1320]/80 border border-[#222B3D]/60 p-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-fuchsia-400/30 to-transparent" />
              <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#7B8AA0] mb-4 flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-[#FF00FF]" /> TPS Trend
              </h2>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222B3D" vertical={false} />
                    <XAxis dataKey="time" stroke="#7B8AA0" fontSize={10} tickMargin={8} axisLine={false} tickLine={false} />
                    <YAxis stroke="#7B8AA0" fontSize={10} axisLine={false} tickLine={false} tickFormatter={(val) => `${val} t/s`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#05070D', borderColor: '#FF00FF', borderRadius: '12px', color: '#F8FAFC', boxShadow: '0 0 30px rgba(255,0,255,0.1)' }}
                      itemStyle={{ color: '#FF00FF', fontWeight: 'bold' }}
                    />
                    <Line type="monotone" dataKey="tps" stroke="#FF00FF" strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: '#FF00FF', stroke: '#05070D', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className="rounded-3xl bg-[#0E1320]/60 border border-[#222B3D]/60 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#7B8AA0] flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-[#FF00FF]" /> Recent Activity
                </h2>
                {lastUpdated && (
                  <span className="text-[9px] text-[#7B8AA0]/60 font-mono">updated {lastUpdated}</span>
                )}
              </div>
              {recentStats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#7B8AA0]">
                  <Activity className="w-10 h-10 animate-pulse mb-4 opacity-50" />
                  <p className="text-xs font-mono">Waiting for incoming traffic...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {recentStats.map((s) => (
                    <Card key={s.id} s={s} onClick={() => setDetailId(s.id)} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* Requests Tab */}
        {activeTab === 'requests' && (
          <section className="rounded-3xl bg-[#0E1320]/60 border border-[#222B3D]/60 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <List className="w-4 h-4 text-[#FF00FF]" />
                <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#7B8AA0]">All Requests</h2>
                {lastUpdated && (
                  <span className="text-[9px] text-[#7B8AA0]/60 font-mono ml-2">updated {lastUpdated}</span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="w-44">
                  <Select
                    value={filterEndpoint}
                    onChange={setFilterEndpoint}
                    options={[
                      { value: '', label: 'All Endpoints' },
                      ...uniqueEndpoints.map((e) => ({ value: e, label: e })),
                    ]}
                    placeholder="All Endpoints"
                  />
                </div>
                <button
                  onClick={fetchData}
                  className="p-2 rounded-lg bg-[#0E1320] border border-[#222B3D] text-[#7B8AA0] hover:text-[#F8FAFC] hover:border-[#FF00FF]/50 transition-all duration-200 active:scale-95"
                  title="Refresh"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
              </div>
            </div>

            {filteredStats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-[#7B8AA0]">
                <List className="w-10 h-10 animate-pulse mb-4 opacity-50" />
                <p className="text-xs font-mono">Waiting for incoming traffic...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredStats.map((s) => (
                  <Card key={s.id} s={s} onClick={() => setDetailId(s.id)} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Providers Tab */}
        {activeTab === 'providers' && (
          <div className="max-w-3xl space-y-8">
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-bold uppercase tracking-widest text-[#F8FAFC] flex items-center gap-2">
                  <Signal className="w-4 h-4 text-[#FF00FF]" /> Network Nodes
                </h2>
                <span className="text-[10px] font-mono text-[#7B8AA0] bg-[#0E1320] px-3 py-1 rounded-full">{onlineCount}/{providers.length} online</span>
              </div>

              {providers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-[#7B8AA0] rounded-2xl border border-dashed border-[#222B3D]/60">
                  <Signal className="w-10 h-10 mb-4 opacity-40" />
                  <p className="text-xs font-mono">No nodes registered yet</p>
                  <p className="text-[10px] text-[#7B8AA0]/50 mt-1 font-mono">Use the form below to add a provider</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {providers.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setActiveProviderURL(p.url)}
                      className={`relative rounded-2xl overflow-hidden p-5 group transition-all duration-500 cursor-pointer ${
                        activeProviderURL === p.url
                          ? 'bg-gradient-to-br from-fuchsia-500/20 to-[#0E1320] border-fuchsia-500 scale-[1.02] shadow-[0_0_30px_rgba(255,0,255,0.08)]'
                          : 'bg-[#0E1320]/60 hover:bg-[#151C2E] border-[#222B3D]/60'
                      } border`}
                    >
                      {activeProviderURL === p.url && (
                        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-fuchsia-400 to-transparent" />
                      )}
                      <div className="flex items-center justify-between mb-3">
                        <div className="font-semibold text-sm text-[#F8FAFC]">{p.name}</div>
                        <div className={`w-3 h-3 rounded-full shrink-0 ${
                          p.status === 'online'
                            ? 'bg-[#00FFA3] shadow-[0_0_16px_rgba(0,255,163,0.5)] animate-pulse'
                            : 'bg-red-500/40'
                        }`} />
                      </div>
                      <div className="text-[11px] text-[#7B8AA0] font-mono truncate">{p.url}</div>
                      <div className="mt-3 flex items-center gap-2">
                        <span className={`text-[9px] font-bold uppercase tracking-wider ${
                          p.status === 'online' ? 'text-[#00FFA3]' : 'text-red-400'
                        }`}>
                          {p.status}
                        </span>
                        {activeProviderURL === p.url && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-[#FF00FF] ml-auto">active target</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-[#222B3D]/60 pt-8">
              <h2 className="text-sm font-bold uppercase tracking-widest text-[#F8FAFC] flex items-center gap-2 mb-5">
                <Plus className="w-4 h-4 text-[#FF00FF]" /> Add Node
              </h2>
              <div className="rounded-3xl bg-[#0E1320]/40 border border-[#222B3D]/60 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] block mb-1.5">Alias</label>
                    <input
                      type="text"
                      placeholder="e.g. GPU-Rig-1"
                      value={providerName}
                      onChange={(e) => setProviderName(e.target.value)}
                      className="w-full bg-[#05070D] border border-[#222B3D] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FF00FF]/50 text-[#F8FAFC] font-mono placeholder:text-[#7B8AA0]/40 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] block mb-1.5">Protocol</label>
                    <div className="flex rounded-xl overflow-hidden border border-[#222B3D]">
                      <button
                        type="button"
                        onClick={() => setProviderProtocol('http')}
                        className={`flex-1 py-3 text-sm font-mono font-bold transition-colors ${
                          providerProtocol === 'http'
                            ? 'bg-[#FF00FF] text-black'
                            : 'bg-[#05070D] text-[#7B8AA0] hover:text-[#F8FAFC]'
                        }`}
                      >
                        http
                      </button>
                      <button
                        type="button"
                        onClick={() => setProviderProtocol('https')}
                        className={`flex-1 py-3 text-sm font-mono font-bold transition-colors ${
                          providerProtocol === 'https'
                            ? 'bg-[#FF00FF] text-black'
                            : 'bg-[#05070D] text-[#7B8AA0] hover:text-[#F8FAFC]'
                        }`}
                      >
                        https
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] block mb-1.5">IP / Host</label>
                    <input
                      type="text"
                      placeholder="e.g. 192.168.1.50"
                      value={providerHost}
                      onChange={(e) => setProviderHost(e.target.value)}
                      className="w-full bg-[#05070D] border border-[#222B3D] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FF00FF]/50 text-[#F8FAFC] font-mono placeholder:text-[#7B8AA0]/40 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] block mb-1.5">Port</label>
                    <input
                      type="text"
                      placeholder="11434"
                      value={providerPort}
                      onChange={(e) => setProviderPort(e.target.value)}
                      className="w-full bg-[#05070D] border border-[#222B3D] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FF00FF]/50 text-[#F8FAFC] font-mono placeholder:text-[#7B8AA0]/40 transition-colors"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] block mb-1.5">Provider Type</label>
                    <div className="flex rounded-xl overflow-hidden border border-[#222B3D]">
                      {providerPresets.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          onClick={() => applyPreset(preset.label)}
                          className={`flex-1 py-3 text-sm font-mono font-bold transition-colors ${
                            providerPath === preset.path
                              ? 'bg-[#FF00FF] text-black'
                              : 'bg-[#05070D] text-[#7B8AA0] hover:text-[#F8FAFC]'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] font-bold uppercase tracking-widest text-[#7B8AA0] block mb-1.5">Route Path</label>
                    <input
                      type="text"
                      placeholder="/api/generate"
                      value={providerPath}
                      onChange={(e) => setProviderPath(e.target.value)}
                      className="w-full bg-[#05070D] border border-[#222B3D] rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#FF00FF]/50 text-[#F8FAFC] font-mono placeholder:text-[#7B8AA0]/40 transition-colors"
                    />
                  </div>
                </div>
                <div className="mb-4 text-[10px] text-[#7B8AA0] font-mono">
                  URL preview: {composeURL(providerHost || '0.0.0.0', providerPort, providerProtocol, providerPath)}
                </div>
                <button
                  onClick={handleAddProvider}
                  className="w-full md:w-auto px-8 py-3 bg-[#FF00FF] text-black rounded-xl hover:bg-white transition-all duration-250 text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" /> Register Node
                </button>
              </div>
            </div>
          </div>
        )}

      </main>

      {/* Chat FAB */}
      <button
        onClick={() => setIsChatOpen(!isChatOpen)}
        className="fixed bottom-8 right-8 w-14 h-14 bg-[#FF00FF] text-black rounded-full shadow-[0_0_25px_rgba(255,0,255,0.5)] hover:scale-110 hover:shadow-[0_0_40px_rgba(255,0,255,0.8)] transition-all duration-250 flex items-center justify-center z-50 active:scale-[0.95]"
      >
        {isChatOpen ? <X className="w-6 h-6" /> : <Terminal className="w-6 h-6" />}
      </button>

      {/* Chat Overlay */}
      <div
        className={`fixed bottom-28 right-8 w-[520px] h-[70vh] backdrop-blur-3xl bg-[#05070D]/70 rounded-[32px] border border-[#222B3D]/80 shadow-[0_30px_80px_rgba(0,0,0,0.5)] flex flex-col z-40 transform transition-all duration-400 origin-bottom-right overflow-hidden ${
          isChatOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'
        }`}
      >
        <div className="px-6 py-4 border-b border-[#222B3D]/60 flex items-center justify-between bg-[#05070D]/80">
          <div className="flex items-center gap-3">
            <Terminal className="w-4 h-4 text-[#FF00FF]" />
            <h3 className="font-semibold text-sm text-[#F8FAFC]">Live Stream</h3>
          </div>
          <span className="text-[9px] font-bold uppercase text-[#00FFA3] bg-[#00FFA3]/10 px-2 py-1 rounded-full animate-pulse">Ready</span>
        </div>

        <div className="flex-1 overflow-y-auto p-6 font-mono text-sm leading-relaxed text-[#F8FAFC]/80 whitespace-pre-wrap bg-black/30">
          {messages || <span className="text-[#7B8AA0]/40 italic text-xs">Awaiting prompt input...</span>}
          {isStreaming && (
            <span className="inline-flex items-center gap-1 ml-2 align-middle">
              <span className="w-1.5 h-1.5 bg-[#FF00FF] rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-[#FF00FF] rounded-full animate-bounce [animation-delay:100ms]" />
              <span className="w-1.5 h-1.5 bg-[#FF00FF] rounded-full animate-bounce [animation-delay:200ms]" />
            </span>
          )}
        </div>

        <div className="px-6 py-4 bg-[#05070D]/90 border-t border-[#222B3D]/60 flex gap-3">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
            disabled={isStreaming || !selectedModel || !activeProviderURL}
            placeholder={selectedModel ? 'Send a prompt...' : 'Awaiting proxy target...'}
            className="flex-1 bg-[#0E1320] border border-[#222B3D] rounded-xl px-4 py-3 focus:outline-none focus:border-[#FF00FF]/50 text-sm text-[#F8FAFC] font-mono placeholder:text-[#7B8AA0]/50 transition-colors"
          />
          <button
            onClick={handleGenerate}
            disabled={isStreaming || !selectedModel || !activeProviderURL}
            className="bg-[#FF00FF] text-black w-12 rounded-xl hover:bg-white disabled:opacity-30 transition-all duration-250 flex items-center justify-center shadow-[0_0_15px_rgba(255,0,255,0.3)] disabled:shadow-none active:scale-[0.95]"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Detail Modal */}
      {detailId !== null && (
        <DetailModal id={detailId} onClose={() => setDetailId(null)} />
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 bg-[#0E1320] border border-[#222B3D] rounded-xl text-xs font-mono text-[#F8FAFC] shadow-[0_10px_40px_rgba(0,0,0,0.4)] backdrop-blur-xl animate-[fadeIn_0.2s_ease-out]">
          {toast}
        </div>
      )}

    </div>
  );
}