import { useState, useEffect } from 'react';
import { Activity, Zap, Send, Database, MessageSquare, X, Server, Filter, Plus, Signal, SignalZero } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function App() {
  const [stats, setStats] = useState<any[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  
  // Selection & Filters
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [activeProviderURL, setActiveProviderURL] = useState<string>('');
  const [filterModel, setFilterModel] = useState<string>('');
  const [filterEndpoint, setFilterEndpoint] = useState<string>('');
  const [filterProvider, setFilterProvider] = useState<string>('');

  // Add Provider
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderURL, setNewProviderURL] = useState('');
  
  // Chat Overlay State
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  
  // Polling for Dashboard
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statRes, modRes, provRes] = await Promise.all([
          fetch('/api/dashboard/stats').catch(() => null),
          fetch('/api/dashboard/models').catch(() => null),
          fetch('/api/dashboard/providers').catch(() => null)
        ]);

        if (statRes) {
          const s = await statRes.json();
          setStats(s.benchmarks || []);
        }
        if (modRes) {
          const m = await modRes.json();
          if (m.models && m.models.length > 0) {
            setModels(m.models);
            if (!selectedModel) setSelectedModel(m.models[0]);
          }
        }
        if (provRes) {
          const p = await provRes.json();
          if (p.providers) {
            setProviders(p.providers);
            if (!activeProviderURL && p.providers.length > 0) {
              setActiveProviderURL(p.providers[0].url);
            }
          }
        }
      } catch (err) {
        // silent
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleAddProvider = async () => {
    if (!newProviderName || !newProviderURL) return;
    await fetch('/api/dashboard/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newProviderName, url: newProviderURL })
    });
    setNewProviderName('');
    setNewProviderURL('');
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || isStreaming) return;
    setIsStreaming(true);
    setMessages(prev => prev + `\n\nUser: ${prompt}\nAI: `);
    
    const currentPrompt = prompt;
    setPrompt('');

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Target-Provider': activeProviderURL
        },
        body: JSON.stringify({
          model: selectedModel,
          prompt: currentPrompt,
          stream: true
        })
      });

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(l => l.trim() !== '');
        
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            if (parsed.response) {
              setMessages(prev => prev + parsed.response);
            }
          } catch (e) { }
        }
      }
    } catch (err) {
      setMessages(prev => prev + `\n[Error: Connection failed]`);
    } finally {
      setIsStreaming(false);
    }
  };

  const filteredStats = stats.filter(s => {
    if (filterModel && s.model_endpoint && !s.model_endpoint.includes(filterModel)) return false;
    if (filterProvider && s.provider_url !== filterProvider) return false;
    if (filterEndpoint && s.model_endpoint !== filterEndpoint) return false;
    return true;
  });

  const chartData = [...filteredStats].reverse().map(s => ({
    time: new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    tps: parseFloat(s.tps.toFixed(2)),
    ttft: s.ttft_ns / 1_000_000
  }));

  // Helper to extract unique endpoint paths from db strings for filter dropdown
  const uniqueEndpoints = Array.from(new Set(stats.map(s => s.model_endpoint).filter(Boolean)));
  const uniqueModels = Array.from(new Set(stats.map(s => s.prompt).filter(Boolean))); // Normally model name is in prompt if we parsed it, but for now we just filter on what we have. Actually the target might just be /api/generate

  return (
    <div className="min-h-screen bg-black text-[#F8FAFC] font-sans flex flex-col overflow-x-hidden relative selection:bg-[#FF00FF]/30">
      
      {/* Deep Neon Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#FF00FF] rounded-full blur-[250px] opacity-[0.08] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[40%] bg-[#FF00FF] rounded-full blur-[200px] opacity-[0.05] pointer-events-none"></div>
      
      {/* Header */}
      <header className="px-10 py-6 border-b border-[#1F1F1F] flex items-center justify-between z-10 bg-[#0A0A0A]/80 backdrop-blur-xl sticky top-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#FF00FF] flex items-center justify-center shadow-[0_0_20px_rgba(255,0,255,0.4)] relative">
            <Activity className="text-black w-7 h-7" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-white drop-shadow-[0_0_10px_rgba(255,0,255,0.3)]">Telemetry Matrix</h1>
            <p className="text-xs text-[#FF00FF] font-bold tracking-widest uppercase mt-1">Multi-Node Interceptor</p>
          </div>
        </div>
        
        {/* Active Routing Target */}
        <div className="flex items-center gap-4 bg-[#0A0A0A] border border-[#1F1F1F] p-2 rounded-xl">
          <div className="flex flex-col px-3 border-r border-[#1F1F1F]">
            <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-widest">Active Proxy Target</span>
            <span className="text-sm font-mono text-white mt-0.5">{activeProviderURL || 'Awaiting Node...'}</span>
          </div>
          <div className="px-2">
            <select 
              value={selectedModel} 
              onChange={e => setSelectedModel(e.target.value)}
              className="bg-transparent border border-[#FF00FF]/30 text-[#FF00FF] hover:border-[#FF00FF] px-4 py-2 rounded-lg outline-none appearance-none font-mono text-sm font-bold cursor-pointer transition-colors"
            >
              {models.length === 0 && <option>No Models Detected</option>}
              {models.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 p-10 z-10 space-y-10 max-w-[1600px] mx-auto w-full">
        
        {/* Top Section: Providers / Nodes */}
        <section>
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-sm font-bold text-[#94A3B8] uppercase tracking-widest flex items-center gap-2">
              <Server className="w-4 h-4 text-[#FF00FF]" /> Network Nodes
            </h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {providers.map(p => (
              <div 
                key={p.id} 
                onClick={() => setActiveProviderURL(p.url)}
                className={`p-5 rounded-2xl border transition-all cursor-pointer group ${
                  activeProviderURL === p.url 
                    ? 'bg-[#0A0A0A] border-[#FF00FF] shadow-[0_0_30px_rgba(255,0,255,0.15)]' 
                    : 'bg-[#050505] border-[#1F1F1F] hover:border-[#FF00FF]/50'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-white text-lg">{p.name}</h3>
                  {p.status === 'online' ? (
                    <Signal className="w-5 h-5 text-[#10B981] animate-pulse" />
                  ) : (
                    <SignalZero className="w-5 h-5 text-red-500" />
                  )}
                </div>
                <p className="text-xs font-mono text-[#94A3B8] mb-4 bg-black p-2 rounded-lg border border-[#1F1F1F] truncate">{p.url}</p>
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-[#94A3B8]">
                  <span>Status: <span className={p.status === 'online' ? 'text-[#10B981]' : 'text-red-500'}>{p.status}</span></span>
                  {activeProviderURL === p.url && <span className="text-[#FF00FF]">Active Target</span>}
                </div>
              </div>
            ))}
            
            {/* Add Node Card */}
            <div className="p-5 rounded-2xl border border-dashed border-[#1F1F1F] bg-[#050505] flex flex-col justify-center hover:border-[#FF00FF]/50 transition-colors">
              <div className="flex gap-2 mb-3">
                <input 
                  type="text" placeholder="Alias (e.g. GPU-Rig-1)" 
                  value={newProviderName} onChange={e => setNewProviderName(e.target.value)}
                  className="w-1/2 bg-black border border-[#1F1F1F] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#FF00FF] text-white font-mono"
                />
                <input 
                  type="text" placeholder="URL (http://...)" 
                  value={newProviderURL} onChange={e => setNewProviderURL(e.target.value)}
                  className="w-1/2 bg-black border border-[#1F1F1F] rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-[#FF00FF] text-white font-mono"
                />
              </div>
              <button 
                onClick={handleAddProvider}
                className="w-full py-2 bg-[#FF00FF]/10 text-[#FF00FF] hover:bg-[#FF00FF] hover:text-black border border-[#FF00FF]/30 rounded-lg text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" /> Add Host
              </button>
            </div>
          </div>
        </section>

        {/* Middle Section: Graph */}
        <section className="bg-[#0A0A0A] rounded-3xl p-8 border border-[#1F1F1F] shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#FF00FF] to-transparent opacity-30"></div>
          <h2 className="text-sm font-bold text-[#94A3B8] uppercase tracking-widest mb-6 flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#FF00FF]" /> Global TPS Trend
          </h2>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" vertical={false} />
                <XAxis dataKey="time" stroke="#94A3B8" fontSize={11} tickMargin={10} axisLine={false} tickLine={false} />
                <YAxis stroke="#94A3B8" fontSize={11} axisLine={false} tickLine={false} tickFormatter={(val) => `${val} t/s`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#000000', borderColor: '#FF00FF', borderRadius: '12px', color: '#fff', boxShadow: '0 0 20px rgba(255,0,255,0.2)' }}
                  itemStyle={{ color: '#FF00FF', fontWeight: 'bold' }}
                />
                <Line type="monotone" dataKey="tps" stroke="#FF00FF" strokeWidth={3} dot={{ fill: '#000000', stroke: '#FF00FF', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: '#FF00FF', stroke: '#fff' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Bottom Section: Filtered Matrix Logs */}
        <section className="bg-[#0A0A0A] rounded-3xl border border-[#1F1F1F] overflow-hidden flex flex-col shadow-2xl">
          
          {/* Filters Bar */}
          <div className="p-5 border-b border-[#1F1F1F] bg-black/40 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-[#FF00FF]" />
              <h2 className="text-sm font-bold text-white uppercase tracking-widest">Intercept Matrix Logs</h2>
            </div>
            
            <div className="flex items-center gap-4">
              <Filter className="w-4 h-4 text-[#94A3B8]" />
              <select 
                value={filterProvider} onChange={e => setFilterProvider(e.target.value)}
                className="bg-[#050505] border border-[#1F1F1F] text-[#94A3B8] px-4 py-2 rounded-lg outline-none focus:border-[#FF00FF] text-xs font-mono min-w-[150px]"
              >
                <option value="">All Providers</option>
                {providers.map(p => <option key={p.url} value={p.url}>{p.name}</option>)}
              </select>

              <select 
                value={filterEndpoint} onChange={e => setFilterEndpoint(e.target.value)}
                className="bg-[#050505] border border-[#1F1F1F] text-[#94A3B8] px-4 py-2 rounded-lg outline-none focus:border-[#FF00FF] text-xs font-mono min-w-[150px]"
              >
                <option value="">All Endpoints</option>
                {uniqueEndpoints.map(e => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#050505] text-[#94A3B8] text-[10px] uppercase font-black tracking-widest">
                <tr>
                  <th className="px-8 py-5 border-b border-[#1F1F1F]">Req ID</th>
                  <th className="px-8 py-5 border-b border-[#1F1F1F]">Timestamp</th>
                  <th className="px-8 py-5 border-b border-[#1F1F1F]">Provider</th>
                  <th className="px-8 py-5 border-b border-[#1F1F1F]">Endpoint</th>
                  <th className="px-8 py-5 border-b border-[#1F1F1F]">Tokens</th>
                  <th className="px-8 py-5 border-b border-[#1F1F1F]">TTFT (ms)</th>
                  <th className="px-8 py-5 border-b border-[#1F1F1F] text-right">Speed (TPS)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1F1F1F]">
                {filteredStats.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-8 py-12 text-center text-[#94A3B8] bg-black">No intercepts match the selected filters.</td>
                  </tr>
                )}
                {filteredStats.map((s) => (
                  <tr key={s.id} className="hover:bg-[#FF00FF]/5 transition-colors bg-black">
                    <td className="px-8 py-5 font-mono text-[#FF00FF]/80 text-xs">#{s.id}</td>
                    <td className="px-8 py-5 font-mono text-xs text-[#94A3B8]">{new Date(s.timestamp).toLocaleTimeString()}</td>
                    <td className="px-8 py-5 font-mono text-xs text-white max-w-[200px] truncate">{s.provider_url}</td>
                    <td className="px-8 py-5 font-mono text-xs text-white">
                      <span className="bg-[#1F1F1F] px-2 py-1 rounded text-[#FF00FF]">{s.model_endpoint}</span>
                    </td>
                    <td className="px-8 py-5 font-mono font-bold">{s.total_tokens}</td>
                    <td className="px-8 py-5 font-mono text-[#94A3B8]">{(s.ttft_ns / 1_000_000).toFixed(0)}</td>
                    <td className="px-8 py-5 text-right font-bold text-[#FF00FF] font-mono text-base">{s.tps.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Floating Action Button (FAB) */}
      <button 
        onClick={() => setIsChatOpen(!isChatOpen)}
        className="fixed bottom-10 right-10 w-16 h-16 bg-[#FF00FF] text-black rounded-full shadow-[0_0_30px_rgba(255,0,255,0.6)] hover:scale-110 hover:shadow-[0_0_40px_rgba(255,0,255,0.9)] transition-all flex items-center justify-center z-50 group"
      >
        {isChatOpen ? <X className="w-8 h-8" /> : <MessageSquare className="w-8 h-8 group-hover:animate-pulse" />}
      </button>

      {/* Chat Overlay Modal */}
      <div className={`fixed bottom-32 right-10 w-[450px] h-[600px] bg-[#0A0A0A] border border-[#FF00FF]/50 rounded-3xl shadow-[0_20px_60px_rgba(255,0,255,0.15)] flex flex-col z-40 transform transition-all duration-400 origin-bottom-right overflow-hidden ${isChatOpen ? 'scale-100 opacity-100' : 'scale-0 opacity-0 pointer-events-none'}`}>
        
        <div className="p-5 border-b border-[#1F1F1F] bg-black flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-[#FF00FF]" />
            <h3 className="font-bold text-white tracking-wide">Live Stream Terminal</h3>
          </div>
          <span className="text-[10px] font-bold uppercase text-[#10B981] bg-[#10B981]/10 px-2 py-1 rounded-full animate-pulse">Ready</span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 font-mono text-sm leading-relaxed text-[#F8FAFC]/90 whitespace-pre-wrap bg-black/50">
          {messages || <span className="text-[#94A3B8]/40 italic">Awaiting manual intercept trigger...</span>}
          {isStreaming && <span className="inline-block w-2.5 h-5 bg-[#FF00FF] animate-pulse ml-1 align-middle shadow-[0_0_10px_#FF00FF]"></span>}
        </div>

        <div className="p-5 bg-black border-t border-[#1F1F1F] flex gap-3">
          <input 
            type="text"
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleGenerate()}
            disabled={isStreaming || !selectedModel || !activeProviderURL}
            placeholder={selectedModel ? "Execute prompt..." : "Awaiting proxy target..."}
            className="flex-1 bg-[#0A0A0A] border border-[#1F1F1F] rounded-xl px-4 py-3 focus:outline-none focus:border-[#FF00FF] text-sm text-white font-mono placeholder:text-[#94A3B8]/50 transition-colors"
          />
          <button 
            onClick={handleGenerate}
            disabled={isStreaming || !selectedModel || !activeProviderURL}
            className="bg-[#FF00FF] text-black w-14 rounded-xl hover:bg-white disabled:opacity-30 transition-all flex items-center justify-center shadow-[0_0_15px_rgba(255,0,255,0.4)] disabled:shadow-none"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>

    </div>
  );
}
