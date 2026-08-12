/**
 * Point d'entrée. Le routeur gère l'historique explicitement (§11.4) : sans
 * cela, le bouton retour d'Android éjecte de l'application en mode autonome.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';

import './ui/tokens.css';
import './ui/polices.css';
import { App } from './ui/App.js';

const racine = document.getElementById('racine');
if (!racine) throw new Error('Élément racine introuvable.');

createRoot(racine).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
