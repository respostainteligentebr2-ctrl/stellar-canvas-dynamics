module.exports = {
  apps: [
    {
      name: "singulai-alt-backend",
      cwd: "/projects/active/stellar-canvas-dynamics/stellar-backend",
      script: "/usr/bin/npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: "8091",
        HOST: "127.0.0.1",
        AI_PROVIDER: "ollama",
        OLLAMA_ENDPOINT: "http://127.0.0.1:11434/api/chat",
        OLLAMA_MODEL: "mistral:latest",
        OLLAMA_KEEP_ALIVE: "30m",
        OLLAMA_TIMEOUT_MS: "180000"
      }
    }
  ]
};
