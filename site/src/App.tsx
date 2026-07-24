import Nav from "./components/Nav";
import Hero from "./components/Hero";
import BranchFlow from "./components/BranchFlow";
import Terminal from "./components/Terminal";
import Why from "./components/Why";
import Memory from "./components/Memory";
import Trust from "./components/Trust";
import How from "./components/How";
import Matrix from "./components/Matrix";
import Clis from "./components/Clis";
import Proof from "./components/Proof";
import Install from "./components/Install";
import Activate from "./components/Activate";
import About from "./components/About";
import Footer from "./components/Footer";

export default function App() {
  return (
    <>
      <div className="scanlines" aria-hidden="true" />

      <header className="hero">
        <Nav />
        <Hero />
        <BranchFlow />
        <Terminal />
      </header>

      <Why />
      <Memory />
      <Trust />
      <How />
      <Matrix />
      <Clis />
      <Proof />
      <Install />
      <Activate />
      <About />
      <Footer />
    </>
  );
}
