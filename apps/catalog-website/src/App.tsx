import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { CataloguePage } from './pages/CataloguePage';
import { DetailPage } from './pages/DetailPage';
import { AdministrationPage } from './pages/AdministrationPage';
import { AdministrationsPage } from './pages/AdministrationsPage';
import { loadFonts } from 'bootstrap-italia'
import { useEffect } from 'react';

export default function App() {

  useEffect(() => {
    loadFonts('');
  }, []);






  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<CataloguePage />} />
        <Route path="/software/:slug" element={<DetailPage />} />
        <Route path="/pa" element={<AdministrationsPage />} />
        <Route path="/pa/:ipa" element={<AdministrationPage />} />
      </Routes>
    </BrowserRouter>
  );
}
