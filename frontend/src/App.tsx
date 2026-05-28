import { Routes, Route, Navigate } from "react-router-dom";
import Shell from "./components/Shell";
import Landing from "./pages/Landing";
import Kabadiwala from "./pages/Kabadiwala";
import Aggregator from "./pages/Aggregator";
import Recycler from "./pages/Recycler";
import Municipality from "./pages/Municipality";
import TrustLayer from "./pages/TrustLayer";
import SmsSimulator from "./pages/SmsSimulator";
import Collector from "./pages/Collector";
import Ragpicker from "./pages/Ragpicker";
import Provenance from "./pages/Provenance";
import Workflow from "./pages/Workflow";
import LiveMap from "./pages/LiveMap";
import Setup from "./pages/Setup";
import Admin from "./pages/Admin";
import Risk from "./pages/Risk";
import Flows from "./pages/Flows";

export default function App() {
  return (
    <Shell>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/collector" element={<Collector />} />
        <Route path="/ragpicker" element={<Ragpicker />} />
        <Route path="/kabadiwala" element={<Kabadiwala />} />
        <Route path="/aggregator" element={<Aggregator />} />
        <Route path="/recycler" element={<Recycler />} />
        <Route path="/municipality" element={<Municipality />} />
        <Route path="/sms" element={<SmsSimulator />} />
        <Route path="/trust" element={<TrustLayer />} />
        <Route path="/provenance" element={<Provenance />} />
        <Route path="/workflow" element={<Workflow />} />
        <Route path="/live" element={<LiveMap />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/risk" element={<Risk />} />
        <Route path="/flows" element={<Flows />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
