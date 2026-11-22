/* ═══════════════════════════════════════════════════════════════
   VOYAGER · data.js
   Single source of truth for portfolio content. Sections render
   lists from here; the modal, command palette and orbit map read
   the same objects — edit content in ONE place.

   Item shape understood by GK.modal.open(item):
   { kind, title, meta, desc, tags[], image?, thumb?, video?, link?, repo?, download?, isCurrent?, icon?, art? }
   `image` is the full-size file (modal); `thumb` is a ≤720px JPEG for lists, cards and hover previews.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const GK = (window.GK = window.GK || {});

  GK.data = {
    person: {
      name: 'Gokula Kumaran',
      first: 'Gokula',
      last: 'Kumaran',
      initials: 'GK',
      title: 'Game & Full-Stack Developer',
      location: 'Tamil Nadu, India',
      coords: '11.1271° N · 78.6569° E',
      availability: 'Available for projects · Q4 2026',
      email: 'gokulakumaran2007@gmail.com',
      phone: '+91 73739 80805',
      status: 'Open to work',
      photo: 'images/profile2.jpg',
      degree: 'B.Tech — Computer Science & Business Systems',
      college: 'Ramco Institute of Technology',
    },

    social: [
      { name: 'GitHub', handle: '@sGokulaKumaran', url: 'https://github.com/sGokulaKumaran' },
      { name: 'LinkedIn', handle: 'gokula-kumaran-s', url: 'https://www.linkedin.com/in/gokula-kumaran-s-503545328/' },
      { name: 'Instagram', handle: '@goku_1._38', url: 'https://www.instagram.com/goku_1._38?igsh=Y3EzbXhndzVlcHc2' },
    ],

    /* typed in the Role sector */
    roles: ['Game Developer', 'Full-Stack Engineer', 'Shader Artist', '3D Environment Designer', 'AI Tinkerer', 'Creative Coder'],

    /* About-sector tag chips */
    tags: ['Unity 3D', 'C#', 'React', 'Three.js', 'Python', 'Blender', 'Java', 'DSA', 'AI/ML', 'Django'],

    education: [
      {
        kind: 'education', id: 'school',
        title: 'NA Annappa Raja Memorial Higher Secondary School',
        short: 'Higher Secondary School', org: 'NA Annappa Raja Memorial HSS',
        meta: 'Higher Secondary School · Tamil Nadu', period: 'Higher Secondary',
        icon: '🏫', art: 'design', image: 'images/school.jpg', thumb: 'images/thumbs/school.jpg',
        desc: 'Completed my higher secondary education here, where I developed an interest in computers, programming, and technology — laying the foundation for my journey into software and game development.',
        tags: ['Higher Secondary', 'Tamil Nadu', 'Programming', 'Technology'],
      },
      {
        kind: 'education', id: 'college',
        title: 'Ramco Institute of Technology',
        short: 'B.Tech — CSBS', org: 'Ramco Institute of Technology',
        meta: 'B.Tech — CSBS · 2024–Present', period: '2024 — Present',
        icon: '🎓', art: 'fullstack', image: 'images/college.jpg', thumb: 'images/thumbs/college.jpg',
        desc: 'Currently pursuing a B.Tech in Computer Science and Business Systems. Alongside my studies, I explore game development, software engineering, AI, and web technologies through hands-on projects and continuous learning.',
        tags: ['B.Tech', 'CSBS', 'Game Development', 'Software', 'AI'],
      },
    ],

    projects: [
      {
        kind: 'project', id: 'back-exit', category: 'game', num: '01',
        title: 'The Back Exit', listTitle: 'The Back Exit',
        meta: 'Game · Unity · 2024', type: 'Game', year: '2024',
        icon: '👁', art: 'horror',
        image: 'images/projects/the-back-exit.jpg', thumb: 'images/thumbs/the-back-exit.jpg', video: 'https://res.cloudinary.com/ubhnc15t/video/upload/v1793953109/The_Back_Exit.mp4', videoLength: '5:19', videoSize: '15.2 MB',
        short: 'First-person psychological horror game built in Unity with custom UI and AI-driven NPC pathfinding.',
        desc: 'First-person psychological horror game built solo in Unity — featuring an atmospheric forest environment, custom horror UI, camera bobbing, interactive elements, trigger-based jump scares, and AI-driven NPC pathfinding.',
        tags: ['Unity 3D', 'C#', 'Horror Systems', 'AI Pathfinding', 'Shader Work'],
        listTags: ['Unity 3D', 'C#', 'Horror', 'AI'],
        download: 'https://drive.google.com/file/d/1evKDtQj6hWwKQmNIAamry9-bZYq2-gst/view',
      },
      {
        kind: 'project', id: 'zyqra', category: 'ai', num: '02',
        title: 'Zyqra — AI Learning', listTitle: 'Zyqra AI Learning',
        meta: 'Web App · Python · 2024', type: 'Web App', year: '2024',
        icon: '◈', art: 'ai',
        image: 'images/projects/zyqra.jpg', thumb: 'images/thumbs/zyqra.jpg', video: 'https://res.cloudinary.com/pyeu3azf/video/upload/v1791469773/zyqra.mp4', videoLength: '4:20', videoSize: '6.1 MB',
        short: 'AI-powered study platform with real-time doubt solving and automated quiz generation.',
        desc: 'An AI-powered learning platform built with Python and Streamlit — real-time doubt solving, automated quizzes, personalized learning, and interactive study support.',
        tags: ['Python', 'Streamlit', 'AI/ML', 'Real-time Processing', 'UI Design'],
        listTags: ['Python', 'Streamlit', 'AI', 'ML'],
      },
      {
        kind: 'project', id: 'forest', category: 'game', num: '03',
        title: 'Realistic Forest — HDRP', listTitle: 'Realistic Forest HDRP',
        meta: '3D Environment · Unity · 2023', type: '3D Environment', year: '2023',
        icon: '🌲', art: 'forest',
        image: 'images/projects/forest.jpg', thumb: 'images/thumbs/forest.jpg', video: 'https://res.cloudinary.com/pyeu3azf/video/upload/v1791469792/forest.mp4', videoLength: '3:39', videoSize: '26.7 MB',
        short: 'High-fidelity forest biome — manual terrain sculpting, real-time global illumination.',
        desc: 'High-fidelity forest biome using Unity HDRP. Manual terrain sculpting, hand-tuned lighting, real-time global illumination and atmospheric volumetrics.',
        tags: ['Unity HDRP', 'Terrain Sculpting', 'Real-time GI', 'Lighting', 'Atmosphere'],
        listTags: ['Unity HDRP', 'GI', 'Lighting'],
      },
      {
        kind: 'project', id: 'pgen', category: 'game', num: '04',
        title: 'Procedural Generation', listTitle: 'Procedural Generation',
        meta: 'R&D · Shaders · 2024', type: 'R&D', year: '2024',
        icon: '◇', art: 'shader',
        image: 'images/projects/pgen.jpg', thumb: 'images/thumbs/pgen.jpg', video: 'https://res.cloudinary.com/pyeu3azf/video/upload/v1791469794/pgen.mp4', videoLength: '2:15', videoSize: '22.3 MB',
        short: 'Procedural generation experiments — noise, fractals, flow fields, chromatic effects.',
        desc: 'Ongoing exploration of procedural terrain generation — Perlin noise, multi-octave noise, infinite terrain chunks, dynamic generation, and optimized world building.',
        tags: ['GLSL', 'HLSL', 'Procedural', 'Math', 'Visuals'],
        listTags: ['GLSL', 'Procedural', 'Math'],
      },
      {
        kind: 'project', id: 'portfolio-v1', category: 'web', num: '05',
        title: '3D Interactive Portfolio', listTitle: 'Personal portfolio v1',
        meta: 'Interactive Web · 2024', type: 'Interactive Web', year: '2024',
        icon: '◉', art: 'portfolio',
        image: 'images/projects/portfoliov1.1.jpg', thumb: 'images/thumbs/portfoliov1.1.jpg',
        short: 'WebGL portfolio with custom GLSL shaders — cinematic, space-themed, scroll-driven.',
        desc: 'WebGL-based portfolio using React and Three.js with custom GLSL shaders for a cinematic, sci-fi feel.',
        tags: ['React', 'Three.js', 'GLSL Shaders', 'WebGL', 'Animation'],
        listTags: ['React', 'Three.js', 'GLSL'],
        link: 'https://gokulakumarans.netlify.app',
      },
      {
        kind: 'project', id: 'portfolio-v2', category: 'web', num: '06',
        title: 'Interactive Space Portfolio', listTitle: 'Personal portfolio v2',
        meta: 'Interactive Web · 2024', type: 'Interactive Web', year: '2024',
        icon: '◉', art: 'portfolio',
        image: 'images/projects/portfoliov2.png', thumb: 'images/thumbs/portfoliov2.jpg',
        short: 'Simple space-themed portfolio built with HTML, CSS and JavaScript — cinematic and scroll-driven.',
        desc: 'Space-themed portfolio built with HTML, CSS and JavaScript — a sci-fi look and feel, made without any framework.',
        tags: ['HTML', 'CSS', 'JavaScript'],
        listTags: ['HTML', 'CSS', 'JavaScript'],
        link: 'https://gokulakumarans2.netlify.app',
        repo: 'https://github.com/sGokulaKumaran/Portfolio-version-2.0',
      },
      {
        kind: 'project', id: 'ridewise', category: 'web', num: '07',
        title: 'RideWise — Transit Platform', listTitle: 'RideWise Transit Platform',
        meta: 'Web App · Spring Boot & React · 2026', type: 'Full-Stack Web', year: '2026',
        icon: '🚌', art: 'fullstack',
        image: 'images/projects/ridewise.png', thumb: 'images/thumbs/ridewise.png', video: 'https://res.cloudinary.com/ubhnc15t/video/upload/v1793038952/Ridewise_short_ad_1.mp4', videoLength: '1:25', videoSize: '18.5 MB',
        short: 'Multi-tier transportation management and live GPS vehicle tracking platform with real-time WebSocket telemetry.',
        desc: 'A complete transportation management and live vehicle tracking platform featuring GPS tracking, multi-tier roles (passengers, drivers, and organization fleet admins), session-based ride assignments, and real-time telemetry built with Java, Spring Boot, and React.',
        tags: ['Java', 'Spring Boot', 'React', 'WebSocket', 'Full-Stack', 'GPS Telemetry'],
        listTags: ['Java', 'Spring Boot', 'React', 'WebSocket'],
        link: 'https://ride-wise.pages.dev',
        repo: 'https://github.com/sGokulaKumaran/Ride-Wise',
      },
      {
        kind: 'project', id: 'portfolio-v4-1', category: 'web', num: '08', isCurrent: true,
        title: 'Voyager 01 — Portfolio v4.1', listTitle: 'Voyager 01 — Portfolio v4.1',
        meta: 'Interactive Web · 2026', type: 'Interactive Web', year: '2026',
        icon: '◉', art: 'portfolio',
        image: 'images/projects/portfoliov4-1.png', thumb: 'images/thumbs/portfoliov4-1.jpg',
        short: "You're exploring it right now — a zero-framework WebGL black-hole voyage with live Web Audio synthesis and 10 sectors.",
        desc: "You're flying through it right now. Built without frameworks or build tools (13 IIFE modules and 8 CSS layers), Voyager 01 pairs a single-pass WebGL Kerr black hole shader with generative Web Audio music, 7 explorer field objectives, and a dual-cartridge HTML5 arcade deck.",
        tags: ['HTML5', 'CSS3', 'JavaScript', 'WebGL GLSL', 'Web Audio API', 'Zero-Build'],
        listTags: ['WebGL GLSL', 'Web Audio', 'JavaScript', 'Zero-Build'],
        link: 'https://gokulakumarans.pages.dev/',
        repo: 'https://github.com/sGokulaKumaran/portfolio-4.1',
      },
    ],

    /* Telemetry sector. suffix is appended after the counted number. */
    metrics: [
      { value: 6, suffix: '+', label: 'Certifications' },
      { value: 8, suffix: '+', label: 'Projects shipped' },
      { value: 2, suffix: '+', label: 'Internships' },
      { value: 100, suffix: '%', label: 'Dedication' },
    ],

    internships: [
      {
        kind: 'internship', id: 'intern-fullstack',
        title: 'Python Full-Stack Development', short: 'Python Full-Stack Development',
        org: 'Skiez Digital', place: 'Chengalpattu', period: 'May – Jul 2026',
        meta: 'Skiez Digital · Chengalpattu · May–Jul 2026',
        icon: '💼', art: 'fullstack', image: 'images/certificates/internfs.png', thumb: 'images/thumbs/internfs.jpg',
        desc: 'Completed a Python Full Stack Development training at Skiez Digital, Chengalpattu, where I learned both frontend and backend web development using Python and modern web technologies. Built practical projects while strengthening my skills in full-stack application development and problem-solving.',
        tags: ['Python', 'Django', 'HTML/CSS', 'JavaScript', 'MySQL', 'Full-Stack'],
      },
      {
        kind: 'internship', id: 'intern-unity',
        title: 'Unity Game Development Intern', short: 'Unity Game Development Intern',
        org: 'Playxoft Studios Private Limited', place: '', period: 'Jun 2026',
        meta: 'Playxoft Studios Private Limited · Jun 2026',
        icon: '🎮', art: 'csharp', image: 'images/certificates/interngame.jpg', thumb: 'images/thumbs/interngame.jpg',
        desc: 'Completed a Unity Game Development Internship at Playxoft Studios Private Limited, where I worked on real-world Unity projects and gained hands-on experience in procedural generation, C#, debugging, optimization, and game development workflows. The internship strengthened my technical skills and provided valuable industry exposure through mentorship and practical development experience.',
        tags: ['Unity 3D', 'C#', 'Procedural Generation', 'Debugging', 'Optimization', 'Game Dev'],
      },
    ],

    /* Systems sector: four disciplines, each an orbit of skills.
       Skills are only those that already appear in this portfolio's content. */
    disciplines: [
      {
        id: 'game', num: '01', icon: '🎮', title: 'Game Development', color: '#6C63FF',
        desc: 'Building interactive games and experiences in Unity with C# — from gameplay mechanics and AI systems to procedural generation and immersive environments.',
        skills: ['Unity 3D', 'C#', 'Unity HDRP', 'Blender', 'GLSL / HLSL'],
      },
      {
        id: 'web', num: '02', icon: '🌐', title: 'Full-Stack Development', color: '#00E5FF',
        desc: 'Creating responsive and modern web applications with clean interfaces, reliable functionality, and a focus on delivering smooth user experiences.',
        skills: ['React', 'Three.js', 'JavaScript', 'HTML / CSS', 'Django', 'MySQL'],
      },
      {
        id: 'ai', num: '03', icon: '🤖', title: 'AI Development', color: '#3DDC84',
        desc: 'Developing AI-powered applications with Python and modern AI tools — integrating intelligent features, automation, and interactive learning experiences.',
        skills: ['Python', 'AI / ML', 'Streamlit'],
      },
      {
        id: 'procgen', num: '04', icon: '🌍', title: 'Procedural Generation', color: '#FFB454',
        desc: 'Exploring procedural world generation in Unity using Perlin noise, multi-octave terrain systems, dynamic terrain chunks, and runtime environment generation.',
        skills: ['Perlin Noise', 'Multi-octave Terrain', 'Terrain Chunks', 'Runtime Generation'],
      },
    ],
    /* language / CS fundamentals that sit at the core of the system */
    foundations: ['Java', 'DSA', 'OOP'],

    certs: [
      { kind: 'cert', id: 'csharp', title: 'C# Programming', short: 'C# Programming', meta: 'Programming Certification', issuer: 'Programming Certification', icon: '⚙️', art: 'csharp', image: 'images/certificates/csharp.jpg', thumb: 'images/thumbs/csharp.jpg', desc: 'Developed a strong foundation in C# programming, object-oriented concepts, and programming logic applicable to Unity game development.', tags: ['C#', 'OOP', 'Unity', 'Programming'] },
      { kind: 'cert', id: 'blender', title: '3D Modeling with Blender', short: 'Blender 3D', meta: '3D Design & Modeling', issuer: '3D Design & Modeling', icon: '🎨', art: 'blender', image: 'images/certificates/blender.jpg', thumb: 'images/thumbs/blender.jpg', desc: 'Explored 3D modeling and asset creation with Blender, including mesh modeling, materials, texturing, and creating assets for interactive environments.', tags: ['Blender', '3D Modeling', 'Texturing', 'Game Assets'] },
      { kind: 'cert', id: 'java', title: 'Java Programming', short: 'Java Programming', meta: 'Programming Certification', issuer: 'Programming Certification', icon: '☕', art: 'java', image: 'images/certificates/java.jpg', thumb: 'images/thumbs/java.jpg', desc: 'Built a foundation in Java programming, object-oriented principles, problem solving, and core programming concepts.', tags: ['Java', 'OOP', 'Problem Solving', 'Programming'] },
      { kind: 'cert', id: 'dsa', title: 'Data Structures & Algorithms', short: 'DSA', meta: 'Computer Science', issuer: 'Computer Science', icon: '🔗', art: 'dsa', image: 'images/certificates/dsa.jpg', thumb: 'images/thumbs/dsa.jpg', desc: 'Studied fundamental data structures and algorithms with a focus on logical thinking, efficient problem solving, and writing structured solutions.', tags: ['DSA', 'Data Structures', 'Algorithms', 'Problem Solving'] },
      { kind: 'cert', id: 'fullstack', title: 'Full-Stack Development', short: 'Full-Stack Development', meta: 'Web Development', issuer: 'Web Development', icon: '🌐', art: 'fullstack', image: 'images/certificates/fullstack.jpg', thumb: 'images/thumbs/fullstack.jpg', desc: 'Gained experience with frontend and backend development concepts for building modern web applications, from user interfaces to application logic and databases.', tags: ['Full-Stack', 'Frontend', 'Backend', 'Web Development'] },
      { kind: 'cert', id: 'responsive', title: 'Responsive Web Design', short: 'Responsive Web Design', meta: 'Web Design', issuer: 'Web Design', icon: '📱', art: 'responsive', image: 'images/certificates/responsive.jpg', thumb: 'images/thumbs/responsive.jpg', desc: 'Learned responsive web design principles for creating adaptable interfaces across desktop, tablet, and mobile screen sizes.', tags: ['Responsive Design', 'CSS', 'Flexbox', 'Mobile-First'] },
    ],

    contact: {
      services: ['Game Development', 'Full-Stack Web', 'AI Integration', 'Other'],
      mailSubject: 'Project Inquiry',
      mailBody: 'Hi Gokula,\n\nI want to talk about a project ...',
      prefill: 'Hi Gokula,\n\nI want to talk about a project. Here are the details:\n\n',
    },

    objectives: [
      { id: 'first-contact', code: 'OBJ-01', title: 'Orbital Ignition', desc: 'Engage the ship systems from the launch sequence.', sector: 0, sectorName: 'Origin' },
      { id: 'event-horizon', code: 'OBJ-02', title: 'Singularity Grazer', desc: 'Double-click or hold near the Hero Black Hole to trigger a relativistic spacetime ripple.', sector: 0, sectorName: 'Origin' },
      { id: 'full-spectrum', code: 'OBJ-03', title: 'Signal Triangulation', desc: 'Lock onto 3 different role beacons on the interactive 3D Holo-Planet.', sector: 1, sectorName: 'Signal' },
      { id: 'deep-scan', code: 'OBJ-04', title: 'Biometric Clearance', desc: 'Scan the Crew Dossier portrait with the X-Ray lens to verify quantum clearance.', sector: 2, sectorName: 'Crew' },
      { id: 'symphony-stars', code: 'OBJ-05', title: 'Harmonic Constellation', desc: 'Ring all 6 certificate stars in the Constellations sky to summon a meteor shower.', sector: 8, sectorName: 'Constellations' },
      { id: 'wormhole-jumper', code: 'OBJ-06', title: 'Beyond Charted Space', desc: 'Traverse the closing Wormhole at the end of the voyage back to Origin.', sector: 9, sectorName: 'Wormhole' },
      { id: 'ace-pilot', code: 'OBJ-07', title: 'Void Ace Pilot', desc: 'Score 400+ in Asteroid Run DX or clear a level in Orbital Slingshot.', sector: 0, sectorName: 'Arcade Deck' },
    ],

    secret: {
      message: "Hi! Most people stop scrolling here. You didn't. That's the kind of curiosity that builds the best engineers — and the best games. This site was hand-rolled without a framework: a hand-written cosmos shader, a generative space score synthesised live in your browser, and a stack of niceties I shipped because I wanted you to feel something. If that resonates with you, we should probably talk.",
      favs: ['🎮 Unity Game Dev', '💻 C# & Java', '🌍 Procedural Generation', '🤖 AI Experiments', '🌐 Web Development', '🛠 Building & Debugging', '🎯 Indie Game Dreams'],
      signature: '— built with curiosity, caffeine & code by Gokula ✨',
    },
  };

  /* helpers */
  GK.data.find = function (id) {
    const d = GK.data;
    const all = [].concat(d.projects, d.certs, d.education, d.internships);
    for (let i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  };
  GK.data.mailto = function (subject, body) {
    const d = GK.data;
    return 'mailto:' + d.person.email + '?subject=' + encodeURIComponent(subject || d.contact.mailSubject) + '&body=' + encodeURIComponent(body || d.contact.mailBody);
  };
})();
