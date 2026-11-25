# Sky Drift: Wind Courier

Game terbang santai: kamu pilot pos yang menjatuhkan paket ke desa di lembah atau pantai.

## Cara menjalankan

Klik dua kali `start-game.bat`. Browser akan terbuka otomatis di http://127.0.0.1:5288/. Biarkan jendela hitamnya tetap terbuka selama main, tutup jendela itu kalau sudah selesai. Kamu butuh Node.js terpasang dan koneksi internet (Three.js dan font diambil dari internet).

Cara lain: buka terminal di folder ini lalu jalankan `node server.mjs`.

## Cara main

Tekan W A S D atau tombol panah untuk terbang, E untuk menjatuhkan paket, Shift atau Space untuk boost, Esc untuk pause. Menu How to Play di layar utama menjelaskan semuanya, dan akan muncul sendiri saat pertama kali game dibuka.

## Aksesibilitas

Di Settings ada ukuran teks dan HUD (Normal, Large, Extra large), mode kontras tinggi, mode kurangi gerakan (ikut pengaturan sistem kalau browser kamu sudah mengaktifkannya), dan Crash protection yang membuat pesawat meluncur di atas bangunan tanpa hancur. Semua pilihan ini tersimpan di browser.

## Di HP dan tablet

Di layar sentuh, game otomatis menampilkan thumb stick di kiri serta tombol DROP dan BOOST di kanan. Putar HP ke mode landscape. Di perangkat sentuh, kualitas grafis dibuat lebih ringan (tanpa bayangan dan anti-aliasing, resolusi dibatasi) supaya tetap lancar. Opsi Fullscreen ada di Settings.

## Menaruh di web

Game ini situs statis biasa, jadi cukup unggah semua file di folder ini (kecuali `tools`, `server.mjs`, dan `start-game.bat` yang hanya dipakai lokal) ke hosting statis seperti Vercel atau GitHub Pages. Tidak ada langkah build. Atribusi model Polyfork (CC BY 4.0) ada di `credits.html` dan sudah ditautkan dari menu utama, jadi file itu harus ikut diunggah.

## Isi folder

`index.html` adalah halaman utama, `ui.css` tampilan menu dan HUD, `menu.js` logika menu, `touch.js` kontrol sentuh, `game.js` aturan permainan dan kontrol, `environment.js` dunia 3D (langit, air, medan, pohon, desa). Folder `assets/models` berisi model 3D (.glb). Folder `tools/blender` berisi skrip Blender yang membuat sebagian model itu, dijalankan lewat command line, misalnya `blender -b --factory-startup -P tools/blender/make_trees.py -- assets/models/trees`.

## Catatan

Folder ini belum jadi repo git sendiri dan lisensi sebagian model .glb belum dicek, jadi jangan dipublikasikan dulu sebelum itu dibereskan.
