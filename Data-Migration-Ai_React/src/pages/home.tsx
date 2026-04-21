import { useNavigate } from "react-router-dom";

function Home() {
  const navigate = useNavigate();

  const styles: any = {
    container: {
      fontFamily: "Arial",
      textAlign: "center",
      padding: "20px"
    },
    hero: {
      padding: "60px 20px",
      background: "#0f172a",
      color: "white",
      borderRadius: "12px"
    },
    title: {
      fontSize: "40px",
      marginBottom: "10px"
    },
    subtitle: {
      fontSize: "18px",
      color: "#cbd5e1",
      marginBottom: "20px"
    },
    button: {
      padding: "12px 25px",
      fontSize: "16px",
      background: "#22c55e",
      color: "white",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer"
    },
    features: {
      display: "flex",
      justifyContent: "center",
      gap: "20px",
      marginTop: "40px",
      flexWrap: "wrap"
    },
    card: {
      width: "250px",
      padding: "20px",
      border: "1px solid #ddd",
      borderRadius: "10px",
      background: "#f8fafc"
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.hero}>
        <h1 style={styles.title}>AI Threat Detection System</h1>
        <p style={styles.subtitle}>
          Scan URLs and files using AI-powered security analysis
        </p>

        <button style={styles.button} onClick={() => navigate("/scan")}>
          Start Scan
        </button>
      </div>

      <div style={styles.features}>
        <div style={styles.card}>
          <h3>🔍 URL Scanner</h3>
          <p>Check if a website is safe or malicious using AI</p>
        </div>

        <div style={styles.card}>
          <h3>📁 File Analysis</h3>
          <p>Upload files and detect malware instantly</p>
        </div>

        <div style={styles.card}>
          <h3>📊 History Tracking</h3>
          <p>View all previous scans and results</p>
        </div>
      </div>
    </div>
  );
}

export default Home;