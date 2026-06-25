import { useState, useEffect, useCallback, useRef } from 'react';

export interface MetricParameters {
  tps: number;
  ttftNs: number;
  observedTtftNs: number;
  networkRttNs: number;
  totalTokens: number;
}

export interface StreamState {
  isConnecting: boolean;
  isConnected: boolean;
  isStreaming: boolean;
  error: string | null;
}

export interface WebSocketMetricsHook {
  state: StreamState;
  metrics: MetricParameters;
  messages: string;
  connectAndStream: (targetUrl: string, endpoint: string, payload: any) => void;
  disconnect: () => void;
}

interface ServerFrame {
  type: 'token' | 'error' | 'done';
  content?: string;
  tps?: number;
  ttft_ns?: number;
  observed_ttft_ns?: number;
  network_rtt_ns?: number;
  total_tokens?: number;
  error?: string;
}

export const useWebSocketMetrics = (): WebSocketMetricsHook => {
  const [state, setState] = useState<StreamState>({
    isConnecting: false,
    isConnected: false,
    isStreaming: false,
    error: null,
  });

  const [metrics, setMetrics] = useState<MetricParameters>({
    tps: 0,
    ttftNs: 0,
    observedTtftNs: 0,
    networkRttNs: 0,
    totalTokens: 0,
  });

  const [messages, setMessages] = useState<string>('');
  const wsRef = useRef<WebSocket | null>(null);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setState(prev => ({ ...prev, isConnected: false, isStreaming: false, isConnecting: false }));
  }, []);

  const connectAndStream = useCallback((wsUrl: string, endpoint: string, payload: any) => {
    // Ensure clean state on new connections
    disconnect();
    
    setState(prev => ({ ...prev, isConnecting: true, error: null }));
    setMessages('');
    setMetrics({ tps: 0, ttftNs: 0, observedTtftNs: 0, networkRttNs: 0, totalTokens: 0 });

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setState(prev => ({ ...prev, isConnecting: false, isConnected: true, isStreaming: true }));
      // Send the initialization structural payload to the proxy handler
      ws.send(JSON.stringify({ endpoint, payload }));
    };

    ws.onmessage = (event) => {
      try {
        const frame: ServerFrame = JSON.parse(event.data);

        if (frame.type === 'token') {
          if (frame.content) {
            setMessages(prev => prev + frame.content!);
          }
          setMetrics({
            tps: frame.tps || 0,
            ttftNs: frame.ttft_ns || 0,
            observedTtftNs: frame.observed_ttft_ns || 0,
            networkRttNs: frame.network_rtt_ns || 0,
            totalTokens: frame.total_tokens || 0,
          });
        } else if (frame.type === 'error') {
          setState(prev => ({ 
            ...prev, 
            error: frame.error || 'Unknown stream error', 
            isStreaming: false 
          }));
          ws.close();
        } else if (frame.type === 'done') {
          setState(prev => ({ ...prev, isStreaming: false }));
          ws.close();
        }
      } catch (err) {
        console.error('Failed to parse WebSocket structural payload frame', err);
      }
    };

    ws.onerror = () => {
      setState(prev => ({ 
        ...prev, 
        error: 'WebSocket connection error. Verify the proxy is running.', 
        isConnecting: false, 
        isConnected: false, 
        isStreaming: false 
      }));
    };

    ws.onclose = () => {
      setState(prev => ({ ...prev, isConnected: false, isStreaming: false }));
      wsRef.current = null;
    };
  }, [disconnect]);

  // Clean up the WebSocket connection on component unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    metrics,
    messages,
    connectAndStream,
    disconnect,
  };
};
