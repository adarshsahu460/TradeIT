import { type FormEvent, useState } from "react";

import { useAuth } from "../auth/AuthContext";

import "./AuthPanel.css";

type Mode = "login" | "register";

export function AuthPanel() {
  const { login, register, loading, error } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMessage(null);

    try {
      if (mode === "login") {
        await login({ email, password });
        setMessage("Logged in successfully");
      } else {
        await register({ email, password });
        setMessage("Account created");
      }
    } catch (err) {
      setMessage(null);
    }
  };

  return (
    <div className="auth-panel">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>{mode === "login" ? "Sign in" : "Create account"}</h1>
        <p className="auth-description">
          Use your email and a secure password to {mode === "login" ? "access" : "register for"} TradeIT.
        </p>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
        </button>
        <button
          className="ghost"
          type="button"
          onClick={() => {
            setMode((prev) => (prev === "login" ? "register" : "login"));
            setMessage(null);
          }}
        >
          {mode === "login" ? "Need an account? Register" : "Already registered? Sign in"}
        </button>
        {message ? <p className="auth-message">{message}</p> : null}
        {error ? <p className="auth-error">{error}</p> : null}
      </form>
    </div>
  );
}
