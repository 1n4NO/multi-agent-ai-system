"use client";

import { useState } from "react";
import {
  Container,
  TextField,
  Button,
  Typography,
  Paper,
  Box,
} from "@mui/material";
import AgentGraph from "@/components/AgentGraph";

export default function Home() {
  const [goal, setGoal] = useState("");
  const [logs, setLogs] = useState<any[]>([]);
  const [currentStep, setCurrentStep] = useState("");

  const runAgents = async () => {
    setLogs([]);
    setCurrentStep("");

    const res = await fetch("/api/agent", {
      method: "POST",
      body: JSON.stringify({ goal }),
    });

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n\n");

      lines.forEach((line) => {
        if (line.startsWith("data: ")) {
          const parsed = JSON.parse(line.replace("data: ", ""));

          if (parsed.step) {
            setCurrentStep(parsed.step);
          }

          setLogs((prev) => [...prev, parsed]);
        }
      });
    }
  };

  return (
    <Container maxWidth="md" style={{ marginTop: 40 }}>
      <Typography variant="h4" gutterBottom>
        Multi-Agent AI System
      </Typography>

      <Paper style={{ padding: 20, marginBottom: 20 }}>
        <TextField
          fullWidth
          label="Enter your goal"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />

        <Box mt={2}>
          <Button variant="contained" onClick={runAgents}>
            Run Agents
          </Button>
        </Box>
      </Paper>

      {/* 🔥 Graph */}
      <AgentGraph currentStep={currentStep} />

      {/* Logs Panel */}
      <Paper style={{ padding: 20, marginTop: 20, maxHeight: 300, overflow: "auto" }}>
        {logs.map((log, i) => (
          <pre key={i}>{JSON.stringify(log, null, 2)}</pre>
        ))}
      </Paper>
    </Container>
  );
}