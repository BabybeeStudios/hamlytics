export default function Home() {
  return (
    <main
      style={{
        padding: "40px",
        fontFamily: "system-ui",
        maxWidth: 860,
        margin: "0 auto",
        lineHeight: 1.5,
      }}
    >
      <h1>Hamlytics</h1>

      <p>
        Hamlytics is a browser-based analytics tool for public TikTok profiles.
        It provides basic insights for free, with advanced features available via
        subscription.
      </p>

      <h2>Features</h2>
      <ul>
        <li>Scan profiles (views)</li>
        <li>Deep scan (views, likes, comments)</li>
        <li>Top-performing video insights</li>
        <li>Profile comparisons</li>
        <li>CSV &amp; JSON exports</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Email:{" "}
        <a href="mailto:hamlytics@gmail.com">hamlyticse@gmail.com</a>
      </p>

      <p style={{ fontSize: 12, opacity: 0.7, marginTop: 24 }}>
        Not affiliated with TikTok.
      </p>
    </main>
  );
}
