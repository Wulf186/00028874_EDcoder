import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import NVItemEncoderDecoder from './28874encoder_decoder';

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <NVItemEncoderDecoder />;
    </>
  )
}

export default App
