import React, { useState, useEffect } from 'react';
import { ClipboardList, Wrench, FileText, HardHat, LogIn, LogOut, Loader2 } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from 'firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  onSnapshot,
  query,
  orderBy,
  enableIndexedDbPersistence,
} from 'firebase/firestore';

// ============================================================
// GANTI dengan firebaseConfig dari project Firebase Alan
// (Firebase Console -> Project settings -> Your apps -> Web app)
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyDGSdTk6BuBApFlDbi_zegcrdybWDrpc60",
  authDomain: "sistem-informasi-sarpras.firebaseapp.com",
  projectId: "sistem-informasi-sarpras",
  storageBucket: "sistem-informasi-sarpras.firebasestorage.app",
  messagingSenderId: "931421913431",
  appId: "1:931421913431:web:707d82ad102a22433abe12",
};

// URL Google Apps Script Web App - untuk backup/mirror ke Google Sheet
const GOOGLE_SHEET_URL = "https://script.google.com/macros/s/AKfycbwGQ30T8xaevo-ccAgKHi6MiGCSxETzgeZMneQbKksKBOcf4SmxQJJ36hhxCst1EPnxTw/exec";

// Cloudinary - untuk upload foto (gratis, tanpa kartu kredit)
// Cloud Name: Dashboard Cloudinary > pojok kiri atas
// Upload Preset: Settings > Upload > Upload presets (Signing Mode harus "Unsigned")
const CLOUDINARY_CLOUD_NAME = "zuu5nwf1";
const CLOUDINARY_UPLOAD_PRESET = "laporansarpras";

const ADMIN_EMAILS = ['alankoesumah@gmail.com', 'sdnptunasglobaldepok@gmail.com'];

// ---- Inisialisasi Firebase ----
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

// Aktifkan cache offline bawaan Firestore: kalau internet putus, input tetap
// tersimpan di perangkat dan otomatis terkirim begitu online lagi.
enableIndexedDbPersistence(db).catch((err) => {
  console.warn('Offline persistence tidak aktif:', err.code);
});

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('kerusakan');
  const [reports, setReports] = useState([]);
  const [successMessage, setSuccessMessage] = useState('');
  const [dbError, setDbError] = useState('');

  const [kerusakan, setKerusakan] = useState({ lokasi: '', deskripsi: '' });
  const [pengajuan, setPengajuan] = useState({ lokasi: '', permohonan: '' });
  const [fotoFile, setFotoFile] = useState(null);
  const [fotoPreview, setFotoPreview] = useState('');
  const [uploadingFoto, setUploadingFoto] = useState(false);

  const lokasiList = [
    '1 Einstein', '1 Mozart', '1 Nobel', '2 Aristole', '2 Edison', '2 Graham Bell',
    '3 Newton', '3 Pascal', '3 Naismith', '4 Shakespeare', '4 Archimedes', '4 James Watt',
    '5 Plato', '5 Picasso', '5 Morse', '6 Galileo', '6 Beethoven', '6 Habibie',
    'Rugu Bawah', 'Rugu Atas', 'Lainnya'
  ];

  // ---- Auth (Firebase) ----
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // ---- Database: dengarkan koleksi 'reports' secara realtime ----
  // Baca & buat laporan terbuka untuk siapa saja (tidak perlu login).
  // Hanya ubah status yang dibatasi untuk admin (dicek di sisi Rules & tombol cycleStatus).
  useEffect(() => {
    const q = query(collection(db, 'reports'), orderBy('id', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map((d) => d.data());
        setReports(data);
        setDataLoading(false);
        setDbError('');
      },
      (error) => {
        console.error('Gagal memuat data dari Firestore', error);
        setDbError('Gagal memuat data. Periksa koneksi internet.');
        setDataLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // ---- Backup/mirror ke Google Sheet ----
  const sendToSheet = async (payload) => {
    if (!GOOGLE_SHEET_URL || GOOGLE_SHEET_URL.includes('ISI_URL')) return;
    try {
      await fetch(GOOGLE_SHEET_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error('Gagal sinkron ke Sheet', e);
    }
  };

  // ---- Upload foto ke Cloudinary, kembalikan URL publiknya ----
  const uploadFotoToCloudinary = async (file) => {
    if (CLOUDINARY_CLOUD_NAME.includes('ISI_') || CLOUDINARY_UPLOAD_PRESET.includes('ISI_')) {
      throw new Error('Cloudinary belum dikonfigurasi');
    }
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Upload foto gagal');
    const data = await res.json();
    return data.secure_url;
  };

  const handleFotoChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFotoFile(file);
    setFotoPreview(URL.createObjectURL(file));
  };

  const showNotification = (msg) => {
    setSuccessMessage(msg || 'Terima kasih laporannya :)');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const addReport = async (type) => {
    const id = Date.now();

    try {
      let fotoUrl = null;
      if (type === 'kerusakan' && fotoFile) {
        setUploadingFoto(true);
        fotoUrl = await uploadFotoToCloudinary(fotoFile);
        setUploadingFoto(false);
      }

      const newReport = {
        id,
        tanggal: new Date().toLocaleDateString('id-ID'),
        tanggalDone: null,
        pengisi: user ? user.email : 'Guru',
        tipe: type,
        deskripsi:
          type === 'kerusakan'
            ? `${kerusakan.lokasi}: ${kerusakan.deskripsi}`
            : `${pengajuan.lokasi}: ${pengajuan.permohonan}`,
        status: 'Belum Dicek',
        fotoUrl: fotoUrl || null,
      };

      // Dokumen diberi ID = id laporan, supaya gampang di-update nanti
      await setDoc(doc(db, 'reports', String(id)), newReport);
      sendToSheet({ action: 'create', ...newReport });

      setKerusakan({ lokasi: '', deskripsi: '' });
      setPengajuan({ lokasi: '', permohonan: '' });
      setFotoFile(null);
      setFotoPreview('');
      showNotification();
    } catch (e) {
      console.error('Gagal menyimpan laporan', e);
      setUploadingFoto(false);
      setDbError('Gagal mengirim laporan (foto atau data). Coba lagi.');
    }
  };

  const cycleStatus = async (id) => {
    if (!user || !ADMIN_EMAILS.includes(user.email)) return;
    const current = reports.find((r) => r.id === id);
    if (!current) return;

    const nextStatus =
      current.status === 'Belum Dicek' ? 'Diproses' : current.status === 'Diproses' ? 'Selesai' : 'Belum Dicek';
    const tanggalDone = nextStatus === 'Selesai' ? new Date().toLocaleDateString('id-ID') : null;

    try {
      await updateDoc(doc(db, 'reports', String(id)), { status: nextStatus, tanggalDone });
      sendToSheet({ action: 'updateStatus', id, status: nextStatus, tanggalDone });
    } catch (e) {
      console.error('Gagal mengubah status', e);
      setDbError('Gagal mengubah status. Coba lagi.');
    }
  };

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Diproses':
        return 'bg-yellow-400 hover:bg-yellow-500 text-black';
      case 'Selesai':
        return 'bg-green-500 hover:bg-green-600 text-white';
      default:
        return 'bg-red-500 hover:bg-red-600 text-white';
    }
  };

  if (authLoading || dataLoading)
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-pink-400" size={48} />
      </div>
    );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans text-black">
      {successMessage && (
        <div className="fixed top-8 right-1/2 translate-x-1/2 bg-yellow-200 p-4 rounded-2xl shadow-xl z-50 font-bold animate-bounce border border-yellow-300">
          {successMessage}
        </div>
      )}

      <header className="max-w-4xl mx-auto mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <HardHat className="text-yellow-400" size={48} /> Sistem Laporan Sarpras
          </h1>
          {user && <p className="text-sm mt-1">Halo, {user.displayName}</p>}
        </div>
        {user ? (
          <button
            onClick={() => signOut(auth)}
            className="bg-pink-100 px-6 py-2 rounded-full font-bold hover:bg-pink-200 transition-colors flex items-center gap-2"
          >
            <LogOut size={18} /> Logout
          </button>
        ) : (
          <button
            onClick={() => signInWithPopup(auth, provider)}
            className="bg-pink-400 text-white px-6 py-2 rounded-full font-bold hover:bg-pink-500 transition-colors flex items-center gap-2"
          >
            <LogIn size={18} /> Login
          </button>
        )}
      </header>

      <main className="max-w-4xl mx-auto bg-white p-8 rounded-3xl shadow-lg border border-pink-100">
        {dbError && <div className="mb-4 text-sm text-red-600 font-medium">{dbError}</div>}

        <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
          {['kerusakan', 'pengajuan', 'progres'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-full font-medium capitalize ${
                activeTab === tab ? 'bg-yellow-200 border border-yellow-300' : 'bg-white border border-pink-200 hover:bg-gray-100'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'kerusakan' && (
          <div className="space-y-6">
            <select
              className="w-full p-4 border border-pink-200 rounded-2xl"
              value={kerusakan.lokasi}
              onChange={(e) => setKerusakan({ ...kerusakan, lokasi: e.target.value })}
            >
              <option value="">Pilih Lokasi...</option>
              {lokasiList.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <textarea
              placeholder="Deskripsi Kerusakan"
              className="w-full p-4 border border-pink-200 rounded-2xl h-32"
              value={kerusakan.deskripsi}
              onChange={(e) => setKerusakan({ ...kerusakan, deskripsi: e.target.value })}
            />

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-600">Foto Kerusakan (opsional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleFotoChange}
                className="w-full p-3 border border-pink-200 rounded-2xl bg-white text-sm"
              />
              {fotoPreview && (
                <div className="mt-3 flex items-center gap-3">
                  <img src={fotoPreview} alt="Preview" className="w-24 h-24 object-cover rounded-xl border border-pink-200" />
                  <button
                    onClick={() => { setFotoFile(null); setFotoPreview(''); }}
                    className="text-xs text-red-500 font-medium hover:underline"
                  >
                    Hapus foto
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => addReport('kerusakan')}
              disabled={!kerusakan.lokasi || !kerusakan.deskripsi || uploadingFoto}
              className="w-full bg-yellow-200 font-bold p-4 rounded-2xl hover:bg-yellow-300 disabled:opacity-50"
            >
              {uploadingFoto ? 'Mengunggah foto...' : 'Kirim Laporan'}
            </button>
          </div>
        )}

        {activeTab === 'pengajuan' && (
          <div className="space-y-6">
            <select
              className="w-full p-4 border border-pink-200 rounded-2xl"
              value={pengajuan.lokasi}
              onChange={(e) => setPengajuan({ ...pengajuan, lokasi: e.target.value })}
            >
              <option value="">Pilih Lokasi...</option>
              {lokasiList.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <textarea
              placeholder="Detail Pengajuan"
              className="w-full p-4 border border-pink-200 rounded-2xl h-32"
              value={pengajuan.permohonan}
              onChange={(e) => setPengajuan({ ...pengajuan, permohonan: e.target.value })}
            />
            <button
              onClick={() => addReport('pengajuan')}
              disabled={!pengajuan.lokasi || !pengajuan.permohonan}
              className="w-full bg-yellow-200 font-bold p-4 rounded-2xl hover:bg-yellow-300 disabled:opacity-50"
            >
              Kirim Pengajuan
            </button>
          </div>
        )}

        {activeTab === 'progres' &&
          (reports.length === 0 ? (
            <div className="text-center text-gray-400 py-12">Belum ada laporan.</div>
          ) : (
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-pink-100">
                  <th className="p-4">Laporan</th>
                  <th className="p-4">Status</th>
                </tr>
              </thead>
              <tbody>
                {[...reports].reverse().map((r) => (
                  <tr key={r.id} className="border-b border-pink-50">
                    <td className="p-4">
                      <div className="text-xs text-gray-500">
                        {r.tanggal} - <span className="font-bold text-pink-500">{r.pengisi}</span>
                      </div>
                      <div className="font-medium text-sm mt-1">{r.deskripsi}</div>
                      {r.fotoUrl && (
                        <a
                          href={r.fotoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block text-xs text-blue-500 font-bold mt-1 hover:underline"
                        >
                          Lihat Foto
                        </a>
                      )}
                      {r.tanggalDone && (
                        <div className="text-xs text-green-600 mt-1 font-bold">Selesai: {r.tanggalDone}</div>
                      )}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => cycleStatus(r.id)}
                        className={`px-4 py-2 text-xs font-bold rounded-full ${getStatusStyle(r.status)} ${
                          !user || !ADMIN_EMAILS.includes(user?.email) ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                      >
                        {r.status}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
      </main>
    </div>
  );
}
