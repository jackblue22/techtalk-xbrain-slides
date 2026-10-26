import { SlideDeck } from "../components/deck/SlideDeck";
import { slides } from "../content/slides";

export function App() {
  return <SlideDeck slides={slides} />;
}
