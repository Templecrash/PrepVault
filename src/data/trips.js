export const trips = [
  {
    id: 'japan',
    continent: 'Asia',
    country: 'Japan',
    flag: '\u{1F1EF}\u{1F1F5}',
    title: 'Tokyo + Kyoto Experience',
    tagline: 'Neon streets, ancient temples, and unforgettable food',
    heroImage: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&q=80',
    basePrice: 3900,
    duration: 10,
    departureDate: 'Oct 12',
    departureDateFull: 'Oct 12\u201322, 2026',
    spotsLeft: 12,
    flightFrom: 'LAX',
    flightIncluded: 'Los Angeles \u2192 Tokyo (Round-trip, Economy)',
    flightPrice: 1200,
    flightBusiness: { label: 'Los Angeles \u2192 Tokyo (Round-trip, Business)', price: 4800 },
    hotels: [
      {
        segment: 'Tokyo',
        days: 'Day 1\u20135',
        nights: 4,
        base: { name: 'Boutique hotel in Shinjuku', pricePerNight: 180, image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&q=80', description: 'Stylish boutique hotel steps from Shinjuku station. Modern rooms, rooftop bar, and 24/7 convenience store next door.' },
        upgrade: { name: 'Park Hyatt Tokyo', pricePerNight: 420, image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80', description: 'The iconic Lost in Translation hotel. Floor-to-ceiling views of Mt. Fuji, infinity pool, and Michelin-starred dining.' },
      },
      {
        segment: 'Kyoto',
        days: 'Day 6\u201310',
        nights: 4,
        base: { name: 'Traditional ryokan near Gion', pricePerNight: 200, image: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&q=80', description: 'Authentic Japanese inn with tatami rooms, onsen bath, and kaiseki breakfast. Walking distance to Gion district.' },
        upgrade: { name: 'Aman Kyoto', pricePerNight: 550, image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80', description: 'Ultra-luxury forest retreat. Private onsen, zen garden suites, and a hidden sanctuary in the hills above Kyoto.' },
      },
    ],
    segments: [
      {
        name: 'Tokyo',
        days: 'Day 1\u20135',
        stay: { name: 'Boutique hotel in Shinjuku', pricePerNight: 180, nights: 4, included: true },
        experiences: [
          {
            id: 'jp-sushi', name: 'Subway sushi stall experience', emoji: '\u{1F363}',
            description: 'Authentic omakase at a 6-seat counter under the Yurakucho tracks. Chef Tanaka has been serving here for 30 years.',
            price: 60, popular: true, popularPercent: 92, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=800&q=80',
            duration: '2.5 hours',
            timeOfDay: 'Evening, 6:00 PM',
            whatsIncluded: ['12-piece omakase set', 'Sake pairing (2 cups)', 'English-speaking food guide'],
            host: { name: 'Chef Hiroshi Tanaka', photo: 'https://images.unsplash.com/photo-1583394293214-28ded15ee548?w=200&q=80', role: 'Master Sushi Chef, 30 years experience', contact: 'hiroshi@wayfare.travel' }
          },
          {
            id: 'jp-cars', name: 'Yokohama underground car meet', emoji: '\u{1F697}',
            description: 'Late-night meetup with JDM legends \u2014 Skylines, Supras, and RX-7s under the Daikoku parking area lights.',
            price: 120, popular: false, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&q=80',
            duration: '4 hours',
            timeOfDay: 'Night, 10:00 PM',
            whatsIncluded: ['Private transport to Daikoku PA', 'Meet local car crew', 'Ride-along in a tuned R34 GTR', 'Midnight ramen stop'],
            host: { name: 'Kenji Matsuda', photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&q=80', role: 'JDM car culture guide & collector', contact: 'kenji@wayfare.travel' }
          },
          {
            id: 'jp-akihabara', name: 'Akihabara retro gaming + Pok\u00e9mon hunt', emoji: '\u{1F3AE}',
            description: 'Dive into multi-floor arcades, hunt vintage Pok\u00e9mon cards, and explore the otaku capital of the world.',
            price: 80, popular: true, popularPercent: 87, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=800&q=80',
            duration: '5 hours',
            timeOfDay: 'Afternoon, 1:00 PM',
            whatsIncluded: ['Guided tour of 5 top retro shops', 'Arcade credit (\u00A51,000)', 'Pok\u00e9mon card authentication tips', 'Maid caf\u00e9 visit'],
            host: { name: 'Yuki Nakamura', photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&q=80', role: 'Otaku culture expert & vintage collector', contact: 'yuki@wayfare.travel' }
          },
          {
            id: 'jp-temple', name: 'Gotokuji (beckoning cat temple) + guide', emoji: '\u{1F431}',
            description: 'The temple that inspired the lucky cat. Thousands of maneki-neko figurines line the grounds. Private guide included.',
            price: 50, popular: false, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800&q=80',
            duration: '2 hours',
            timeOfDay: 'Morning, 9:00 AM',
            whatsIncluded: ['Private English-speaking guide', 'Temple history & cultural context', 'Small maneki-neko figurine souvenir'],
            host: { name: 'Aiko Suzuki', photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80', role: 'Licensed cultural guide, Tokyo', contact: 'aiko@wayfare.travel' }
          },
          {
            id: 'jp-tattoo', name: 'Tattoo session (licensed studio)', emoji: '\u{1F58B}\u{FE0F}',
            description: 'Get inked at a top-rated Shibuya studio specializing in traditional Japanese irezumi and modern styles.',
            price: 450, popular: false, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1611501275019-9b5cda994e8d?w=800&q=80',
            duration: '3\u20136 hours',
            timeOfDay: 'By appointment',
            whatsIncluded: ['Design consultation', 'Custom artwork', 'All supplies & aftercare kit', 'English-speaking artist'],
            host: { name: 'Takeshi Mori', photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80', role: 'Irezumi tattoo artist, 15 years experience', contact: 'takeshi@wayfare.travel' }
          },
          {
            id: 'jp-bar', name: 'Hidden bar night (reservation + guide)', emoji: '\u{1F378}',
            description: 'Speakeasy crawl through Golden Gai \u2014 three secret bars, each seating fewer than 8 people.',
            price: 90, popular: true, popularPercent: 78, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1569096651661-820d0de8b4ab?w=800&q=80',
            duration: '3 hours',
            timeOfDay: 'Night, 8:00 PM',
            whatsIncluded: ['3 bar reservations (Golden Gai)', '1 signature cocktail per bar', 'Local nightlife guide', 'Late-night yakitori stop'],
            host: { name: 'Ryo Kimura', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80', role: 'Tokyo nightlife curator', contact: 'ryo@wayfare.travel' }
          },
        ]
      },
      {
        name: 'Kyoto',
        days: 'Day 6\u201310',
        stay: { name: 'Traditional ryokan near Gion', pricePerNight: 200, nights: 4, included: true },
        experiences: [
          {
            id: 'jp-inari', name: 'Fushimi Inari sunrise hike', emoji: '\u26E9\u{FE0F}',
            description: 'Beat the crowds with a 5:30 AM start through thousands of vermillion torii gates. Included with your trip.',
            price: 0, popular: true, popularPercent: 98, defaultOn: true, included: true,
            image: 'https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=800&q=80',
            duration: '3 hours',
            timeOfDay: 'Sunrise, 5:30 AM',
            whatsIncluded: ['English-speaking hiking guide', 'Quiet route through all gates', 'Tea & snack at summit shrine'],
            host: { name: 'Haruto Yamamoto', photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80', role: 'Kyoto hiking & temple guide', contact: 'haruto@wayfare.travel' }
          },
          {
            id: 'jp-tea', name: 'Private tea ceremony', emoji: '\u{1F375}',
            description: 'Learn the art of matcha preparation in a 200-year-old tea house with a certified tea master.',
            price: 70, popular: true, popularPercent: 81, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=800&q=80',
            duration: '1.5 hours',
            timeOfDay: 'Afternoon, 2:00 PM',
            whatsIncluded: ['Private ceremony for your group only', 'Matcha & traditional wagashi sweets', 'Tea ceremony etiquette lesson', 'Souvenir matcha bowl'],
            host: { name: 'Masako Fujita', photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&q=80', role: 'Certified Urasenke tea master', contact: 'masako@wayfare.travel' }
          },
          {
            id: 'jp-zen', name: 'Zen temple overnight stay', emoji: '\u{1F9D8}',
            description: 'Sleep in a working Zen monastery. Morning meditation, vegetarian cuisine, and total digital detox.',
            price: 200, popular: false, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=800&q=80',
            duration: 'Overnight (24 hours)',
            timeOfDay: 'Check-in 3:00 PM',
            whatsIncluded: ['Monastery accommodation', 'Shojin ryori (monk\'s vegetarian cuisine)', 'Morning zazen meditation', 'Sutra chanting session', 'Garden tour'],
          },
          {
            id: 'jp-food', name: 'Pontocho night food crawl', emoji: '\u{1F35C}',
            description: 'Guided walk through Kyoto\'s atmospheric alley \u2014 yakitori, sake, and kaiseki small plates.',
            price: 85, popular: true, popularPercent: 88, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1553621042-f6e147245754?w=800&q=80',
            duration: '3 hours',
            timeOfDay: 'Evening, 6:30 PM',
            whatsIncluded: ['6 food stops along Pontocho alley', 'Sake tasting (3 varieties)', 'Kaiseki small plate at riverside restaurant', 'Local food history narration'],
            host: { name: 'Sakura Ito', photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80', role: 'Kyoto food journalist & guide', contact: 'sakura@wayfare.travel' }
          },
        ]
      }
    ],
    personalities: {
      foodie: ['jp-sushi', 'jp-food', 'jp-tea', 'jp-bar'],
      adventure: ['jp-cars', 'jp-akihabara', 'jp-tattoo'],
      culture: ['jp-temple', 'jp-inari', 'jp-tea', 'jp-zen'],
      luxury: ['jp-bar', 'jp-zen', 'jp-tea', 'jp-sushi'],
    }
  },
  {
    id: 'brazil',
    continent: 'South America',
    country: 'Brazil',
    flag: '\u{1F1E7}\u{1F1F7}',
    title: 'Rio de Janeiro Experience',
    tagline: 'Rhythm, views, and adrenaline in the Cidade Maravilhosa',
    heroImage: 'https://images.unsplash.com/photo-1483729558449-99ef09a8c325?w=800&q=80',
    basePrice: 2800,
    duration: 8,
    departureDate: 'Nov 5',
    departureDateFull: 'Nov 5\u201313, 2026',
    spotsLeft: 8,
    flightFrom: 'LAX',
    flightIncluded: 'Los Angeles \u2192 Rio de Janeiro (Round-trip, Economy)',
    flightPrice: 1100,
    flightBusiness: { label: 'Los Angeles \u2192 Rio de Janeiro (Round-trip, Business)', price: 4200 },
    hotels: [
      {
        segment: 'Rio de Janeiro',
        days: 'Day 1\u20138',
        nights: 7,
        base: { name: 'Oceanfront hotel in Copacabana', pricePerNight: 160, image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&q=80', description: 'Beachfront hotel with ocean-view rooms, rooftop pool, and direct access to Copacabana beach.' },
        upgrade: { name: 'Belmond Copacabana Palace', pricePerNight: 380, image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80', description: 'Rio\'s most iconic luxury hotel since 1923. Olympic-size pool, private beach section, and celebrity-chef restaurant.' },
      },
    ],
    segments: [
      {
        name: 'Rio de Janeiro',
        days: 'Day 1\u20138',
        stay: { name: 'Oceanfront hotel in Copacabana', pricePerNight: 160, nights: 7, included: true },
        experiences: [
          {
            id: 'br-christ', name: 'Christ the Redeemer sunrise visit', emoji: '\u{1F64C}',
            description: 'Skip-the-line access at dawn. Watch the sun rise over Rio from the feet of the iconic statue.',
            price: 45, popular: true, popularPercent: 96, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800&q=80',
            duration: '3 hours',
            timeOfDay: 'Sunrise, 5:00 AM',
            whatsIncluded: ['Skip-the-line tickets', 'Private van transport', 'Professional photographer (10 edited photos)', 'Breakfast on descent'],
            host: { name: 'Lucas Oliveira', photo: 'https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?w=200&q=80', role: 'Rio cultural guide & photographer', contact: 'lucas@wayfare.travel' }
          },
          {
            id: 'br-favela', name: 'Favela community tour (guided)', emoji: '\u{1F3D8}\u{FE0F}',
            description: 'Ethical, community-led tour of Rocinha. Meet local artists, visit community projects, and see Rio from a different perspective.',
            price: 65, popular: true, popularPercent: 74, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1585687343538-2c14a64c1579?w=800&q=80',
            duration: '4 hours',
            timeOfDay: 'Morning, 9:00 AM',
            whatsIncluded: ['Community-led walking tour', 'Visit to local art studio', 'Lunch at community restaurant', 'All proceeds support local projects'],
            host: { name: 'Ana Santos', photo: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&q=80', role: 'Rocinha community organizer', contact: 'ana@wayfare.travel' }
          },
          {
            id: 'br-samba', name: 'Samba night in Lapa', emoji: '\u{1F483}',
            description: 'Live samba at a legendary Lapa club. Dance lesson included \u2014 no experience needed.',
            price: 55, popular: true, popularPercent: 89, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1504609813442-a8924e83f76e?w=800&q=80',
            duration: '4 hours',
            timeOfDay: 'Night, 9:00 PM',
            whatsIncluded: ['1-hour samba dance lesson', 'Entry to live samba club', '2 caipirinhas', 'Local nightlife guide'],
            host: { name: 'Rafael Costa', photo: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=200&q=80', role: 'Professional samba dancer & instructor', contact: 'rafael@wayfare.travel' }
          },
          {
            id: 'br-hangglide', name: 'Hang gliding over Tijuca Forest', emoji: '\u{1FA82}',
            description: 'Tandem flight from Pedra Bonita with panoramic views of the coastline, forest, and city below.',
            price: 180, popular: true, popularPercent: 82, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1503023345310-bd7c1de61c7d?w=800&q=80',
            duration: '2 hours (15-min flight)',
            timeOfDay: 'Morning, 10:00 AM',
            whatsIncluded: ['Tandem flight with certified pilot', 'GoPro video of your flight', 'Transport to/from launch site', 'Landing on S\u00e3o Conrado beach'],
            host: { name: 'Carlos Mendes', photo: 'https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=200&q=80', role: 'Certified tandem pilot, 12 years', contact: 'carlos@wayfare.travel' }
          },
          {
            id: 'br-beach', name: 'Beach club day pass + caipirinha class', emoji: '\u{1F3D6}\u{FE0F}',
            description: 'VIP access to an exclusive Ipanema beach club. Learn to make the perfect caipirinha.',
            price: 95, popular: false, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
            duration: 'Full day',
            timeOfDay: 'Morning, 10:00 AM',
            whatsIncluded: ['VIP beach club access', 'Sun lounger & umbrella', 'Caipirinha mixology class', 'Lunch & 2 cocktails included'],
          },
          {
            id: 'br-sugarloaf', name: 'Sugarloaf Mountain sunset cable car', emoji: '\u{1F3D4}\u{FE0F}',
            description: 'Ride the cable car as the sun sets. Golden hour over Guanabara Bay is unforgettable.',
            price: 40, popular: true, popularPercent: 91, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1516306580123-e6e52b1b7b5f?w=800&q=80',
            duration: '2.5 hours',
            timeOfDay: 'Late afternoon, 4:30 PM',
            whatsIncluded: ['Round-trip cable car tickets', 'Sunset champagne toast at summit', 'Panoramic photo spots guide'],
            host: { name: 'Lucas Oliveira', photo: 'https://images.unsplash.com/photo-1506277886164-e25aa3f4ef7f?w=200&q=80', role: 'Rio cultural guide & photographer', contact: 'lucas@wayfare.travel' }
          },
        ]
      }
    ],
    personalities: {
      foodie: ['br-beach', 'br-samba'],
      adventure: ['br-hangglide', 'br-sugarloaf'],
      culture: ['br-christ', 'br-favela', 'br-samba'],
      luxury: ['br-beach', 'br-hangglide', 'br-sugarloaf'],
    }
  },
  {
    id: 'vietnam',
    continent: 'Asia',
    country: 'Vietnam',
    flag: '\u{1F1FB}\u{1F1F3}',
    title: 'Hanoi to Hoi An Journey',
    tagline: 'Ancient charm, street food heaven, and emerald waters',
    heroImage: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=800&q=80',
    basePrice: 2200,
    duration: 10,
    departureDate: 'Nov 20',
    departureDateFull: 'Nov 20\u201330, 2026',
    spotsLeft: 15,
    flightFrom: 'LAX',
    flightIncluded: 'Los Angeles \u2192 Hanoi (Round-trip, Economy)',
    flightPrice: 1000,
    flightBusiness: { label: 'Los Angeles \u2192 Hanoi (Round-trip, Business)', price: 3800 },
    hotels: [
      {
        segment: 'Hanoi',
        days: 'Day 1\u20134',
        nights: 3,
        base: { name: 'Boutique hotel in Old Quarter', pricePerNight: 65, image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&q=80', description: 'Charming colonial-era boutique hotel in the heart of the Old Quarter. Rooftop bar with Hoan Kiem Lake views.' },
        upgrade: { name: 'Sofitel Legend Metropole', pricePerNight: 220, image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80', description: 'Hanoi\'s most legendary hotel. French colonial grandeur, courtyard pool, and Graham Greene\'s favorite writing spot.' },
      },
      {
        segment: 'Hoi An',
        days: 'Day 5\u201310',
        nights: 5,
        base: { name: 'Riverside boutique resort', pricePerNight: 85, image: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&q=80', description: 'Peaceful resort on the Thu Bon River with infinity pool, bicycle rentals, and 10-minute walk to the ancient town.' },
        upgrade: { name: 'Four Seasons The Nam Hai', pricePerNight: 350, image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80', description: 'Beachfront luxury with 3 infinity pools, private villas, and a world-class spa set among tropical gardens.' },
      },
    ],
    segments: [
      {
        name: 'Hanoi',
        days: 'Day 1\u20134',
        stay: { name: 'Boutique hotel in Old Quarter', pricePerNight: 65, nights: 3, included: true },
        experiences: [
          {
            id: 'vn-food', name: 'Old Quarter street food tour', emoji: '\u{1F35C}',
            description: 'Guided walk through 36 streets. Pho, banh mi, egg coffee, bun cha \u2014 10+ tastings over 3 hours.',
            price: 40, popular: true, popularPercent: 95, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=800&q=80',
            duration: '3.5 hours',
            timeOfDay: 'Morning, 9:00 AM',
            whatsIncluded: ['10+ food tastings', 'Egg coffee at original caf\u00e9', 'Bun cha at Obama\'s restaurant', 'Market walking tour', 'Cold beer stop'],
            host: { name: 'Minh Tran', photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80', role: 'Hanoi food blogger & tour guide', contact: 'minh@wayfare.travel' }
          },
          {
            id: 'vn-halong', name: 'Ha Long Bay overnight cruise', emoji: '\u{1F6F3}\u{FE0F}',
            description: 'Sail through limestone karsts on a traditional junk boat. Kayaking, swimming, and sunset dinner on deck.',
            price: 280, popular: true, popularPercent: 94, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=800&q=80',
            duration: '2 days / 1 night',
            timeOfDay: 'Departs 8:00 AM',
            whatsIncluded: ['Private cabin on junk boat', 'All meals (lunch, dinner, breakfast)', 'Kayaking through caves', 'Sunrise tai chi on deck', 'Swimming & snorkeling gear'],
          },
          {
            id: 'vn-motorbike', name: 'Countryside motorbike ride', emoji: '\u{1F3CD}\u{FE0F}',
            description: 'Full-day ride through rice paddies, villages, and mountain roads with an experienced local guide.',
            price: 75, popular: true, popularPercent: 86, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&q=80',
            duration: '7 hours',
            timeOfDay: 'Morning, 7:30 AM',
            whatsIncluded: ['Honda Wave 110cc (or ride pillion)', 'Helmet & safety gear', 'Local village lunch', 'Rice paddy photo stops', 'Experienced riding guide'],
            host: { name: 'Duc Nguyen', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80', role: 'Motorbike tour leader, 8 years', contact: 'duc@wayfare.travel' }
          },
          {
            id: 'vn-cooking', name: 'Vietnamese cooking class', emoji: '\u{1F468}\u200D\u{1F373}',
            description: 'Market tour + hands-on class. Learn to make pho from scratch, roll spring rolls, and brew Vietnamese coffee.',
            price: 45, popular: false, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=800&q=80',
            duration: '4 hours',
            timeOfDay: 'Morning, 8:30 AM',
            whatsIncluded: ['Guided market tour', 'Hands-on cooking (3 dishes)', 'Recipe booklet to take home', 'Eat everything you make', 'Vietnamese coffee brewing lesson'],
            host: { name: 'Lan Pham', photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&q=80', role: 'Chef & cooking school owner', contact: 'lan@wayfare.travel' }
          },
        ]
      },
      {
        name: 'Hoi An',
        days: 'Day 5\u201310',
        stay: { name: 'Riverside boutique resort', pricePerNight: 85, nights: 5, included: true },
        experiences: [
          {
            id: 'vn-lantern', name: 'Hoi An lantern night + boat ride', emoji: '\u{1FA94}',
            description: 'Release lanterns on the Thu Bon River during the monthly full moon festival. Magical and unforgettable.',
            price: 35, popular: true, popularPercent: 93, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=800&q=80',
            duration: '2.5 hours',
            timeOfDay: 'Evening, 6:00 PM',
            whatsIncluded: ['Lantern-making workshop', 'Boat ride on Thu Bon River', '3 floating lanterns to release', 'Old town walking tour'],
            host: { name: 'Thao Le', photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&q=80', role: 'Hoi An cultural guide', contact: 'thao@wayfare.travel' }
          },
          {
            id: 'vn-tailor', name: 'Custom tailoring experience', emoji: '\u{1FAA1}',
            description: 'Get a bespoke suit or dress made in 24 hours. Hoi An is famous for its master tailors.',
            price: 120, popular: true, popularPercent: 72, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1558618666-fcd25c85f82e?w=800&q=80',
            duration: '2 fittings over 24 hours',
            timeOfDay: 'Flexible',
            whatsIncluded: ['Fabric selection consultation', 'Custom measurements', 'Bespoke suit OR dress (1 piece)', 'Alterations fitting next day', 'Delivery to hotel'],
            host: { name: 'Mr. Hai', photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80', role: 'Master tailor, 3rd generation', contact: 'hai@wayfare.travel' }
          },
          {
            id: 'vn-basket', name: 'Basket boat fishing village', emoji: '\u{1F6F6}',
            description: 'Spin in a traditional Vietnamese basket boat, crab fish, and cook your catch on the beach.',
            price: 30, popular: false, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1504457047772-27faf1c00561?w=800&q=80',
            duration: '3 hours',
            timeOfDay: 'Morning, 8:00 AM',
            whatsIncluded: ['Basket boat ride & spinning', 'Crab fishing with locals', 'Cook your catch on the beach', 'Cold coconut water'],
          },
          {
            id: 'vn-beach', name: 'An Bang Beach day + spa', emoji: '\u{1F3D6}\u{FE0F}',
            description: 'Pristine beach, beachfront seafood lunch, and a traditional Vietnamese spa treatment.',
            price: 55, popular: false, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80',
            duration: 'Full day',
            timeOfDay: 'Morning, 9:00 AM',
            whatsIncluded: ['Beach lounger & umbrella', 'Seafood lunch with beer', '90-minute Vietnamese massage', 'Round-trip bicycle rental'],
          },
        ]
      }
    ],
    personalities: {
      foodie: ['vn-food', 'vn-cooking', 'vn-basket', 'vn-lantern'],
      adventure: ['vn-halong', 'vn-motorbike', 'vn-basket'],
      culture: ['vn-lantern', 'vn-food', 'vn-tailor', 'vn-cooking'],
      luxury: ['vn-halong', 'vn-tailor', 'vn-beach'],
    }
  },
  {
    id: 'ecuador',
    continent: 'South America',
    country: 'Ecuador',
    flag: '\u{1F1EA}\u{1F1E8}',
    title: 'Gal\u00e1pagos Islands Adventure',
    tagline: 'Walk with giants on the most untouched islands on Earth',
    heroImage: 'https://images.unsplash.com/photo-1544979590-37e9b47eb705?w=800&q=80',
    basePrice: 4800,
    duration: 9,
    departureDate: 'Jan 15',
    departureDateFull: 'Jan 15\u201324, 2027',
    spotsLeft: 6,
    flightFrom: 'LAX',
    flightIncluded: 'Los Angeles \u2192 Quito \u2192 Gal\u00e1pagos (Round-trip, Economy)',
    flightPrice: 1700,
    flightBusiness: { label: 'Los Angeles \u2192 Quito \u2192 Gal\u00e1pagos (Round-trip, Business)', price: 5500 },
    hotels: [
      {
        segment: 'Santa Cruz Island',
        days: 'Day 1\u20134',
        nights: 3,
        base: { name: 'Eco-lodge in Puerto Ayora', pricePerNight: 220, image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&q=80', description: 'Sustainable eco-lodge with ocean views, outdoor showers, and a short walk to the harbor.' },
        upgrade: { name: 'Finch Bay Galapagos Hotel', pricePerNight: 450, image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80', description: 'The only beachfront hotel on Santa Cruz. Private beach, yacht excursions, and naturalist-guided property tours.' },
      },
      {
        segment: 'Isabela Island',
        days: 'Day 5\u20139',
        nights: 4,
        base: { name: 'Beachfront guesthouse', pricePerNight: 190, image: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&q=80', description: 'Charming guesthouse steps from the beach. Hammocks, fresh seafood breakfast, and flamingo lagoon next door.' },
        upgrade: { name: 'Isabela Yacht Lodge', pricePerNight: 380, image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80', description: 'Floating yacht lodge experience. Sleep on the water, wake up to sea lions, and dine under the stars on deck.' },
      },
    ],
    segments: [
      {
        name: 'Santa Cruz Island',
        days: 'Day 1\u20134',
        stay: { name: 'Eco-lodge in Puerto Ayora', pricePerNight: 220, nights: 3, included: true },
        experiences: [
          {
            id: 'ec-snorkel', name: 'Snorkeling with sea lions', emoji: '\u{1F9AD}',
            description: 'Swim alongside playful sea lions, sea turtles, and tropical fish in crystal-clear volcanic waters.',
            price: 95, popular: true, popularPercent: 97, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80',
            duration: '4 hours',
            timeOfDay: 'Morning, 8:00 AM',
            whatsIncluded: ['Snorkel gear & wetsuit', 'Boat to snorkel sites', 'Marine naturalist guide', '2 snorkel locations', 'Snacks & water'],
            host: { name: 'Diego Vargas', photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&q=80', role: 'Certified Gal\u00e1pagos naturalist guide', contact: 'diego@wayfare.travel' }
          },
          {
            id: 'ec-tortoise', name: 'Giant tortoise sanctuary visit', emoji: '\u{1F422}',
            description: 'Walk among the gentle giants at the Charles Darwin Research Station. Some are over 150 years old.',
            price: 0, popular: true, popularPercent: 99, defaultOn: true, included: true,
            image: 'https://images.unsplash.com/photo-1559253664-ca249d4608c6?w=800&q=80',
            duration: '2.5 hours',
            timeOfDay: 'Morning, 9:00 AM',
            whatsIncluded: ['Research station entry', 'Naturalist guide', 'Breeding center tour', 'Conservation briefing'],
            host: { name: 'Diego Vargas', photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&q=80', role: 'Certified Gal\u00e1pagos naturalist guide', contact: 'diego@wayfare.travel' }
          },
          {
            id: 'ec-kayak', name: 'Mangrove kayaking + sharks', emoji: '\u{1F6F6}',
            description: 'Paddle through mangrove tunnels where white-tip reef sharks rest in the shallows below.',
            price: 70, popular: true, popularPercent: 78, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1472745433479-4556f22e32c2?w=800&q=80',
            duration: '3 hours',
            timeOfDay: 'Afternoon, 1:00 PM',
            whatsIncluded: ['Tandem kayak', 'Mangrove tunnel route', 'Shark spotting from above', 'Naturalist guide', 'Waterproof phone pouch'],
          },
          {
            id: 'ec-lava', name: 'Lava tunnel exploration', emoji: '\u{1F30B}',
            description: 'Walk through an underground lava tube formed by ancient volcanic eruptions. Headlamps and guide included.',
            price: 45, popular: false, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1462332420958-a05d1e002413?w=800&q=80',
            duration: '2 hours',
            timeOfDay: 'Afternoon, 2:00 PM',
            whatsIncluded: ['Headlamp & helmet', 'Geology guide', 'Underground photography tips', 'Transport to/from tunnel'],
          },
        ]
      },
      {
        name: 'Isabela Island',
        days: 'Day 5\u20139',
        stay: { name: 'Beachfront guesthouse', pricePerNight: 190, nights: 4, included: true },
        experiences: [
          {
            id: 'ec-island', name: 'Island hopping day trip', emoji: '\u{1F3DD}\u{FE0F}',
            description: 'Speedboat to Floreana and North Seymour. Blue-footed boobies, marine iguanas, and flamingos.',
            price: 180, popular: true, popularPercent: 91, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=800&q=80',
            duration: 'Full day (8 hours)',
            timeOfDay: 'Morning, 7:00 AM',
            whatsIncluded: ['Speedboat transfers', '2 island visits', 'Lunch on Floreana', 'Snorkeling gear', 'Naturalist guide all day'],
            host: { name: 'Maria Espinoza', photo: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&q=80', role: 'Marine biologist & island guide', contact: 'maria@wayfare.travel' }
          },
          {
            id: 'ec-volcano', name: 'Sierra Negra volcano hike', emoji: '\u{1F30B}',
            description: 'Trek to the rim of one of the world\'s largest volcanic craters. Surreal Martian landscape.',
            price: 110, popular: true, popularPercent: 84, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1462332420958-a05d1e002413?w=800&q=80',
            duration: '6 hours',
            timeOfDay: 'Morning, 6:30 AM',
            whatsIncluded: ['4x4 transport to trailhead', 'Certified hiking guide', 'Packed lunch & water', 'Crater rim viewpoint', 'Lava field walk'],
            host: { name: 'Pablo Reyes', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80', role: 'Volcanologist & certified guide', contact: 'pablo@wayfare.travel' }
          },
          {
            id: 'ec-dive', name: 'Scuba diving certification dive', emoji: '\u{1F93F}',
            description: 'Dive with hammerhead sharks, manta rays, and sea turtles. PADI certified instructor.',
            price: 220, popular: false, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&q=80',
            duration: '5 hours',
            timeOfDay: 'Morning, 7:30 AM',
            whatsIncluded: ['Full scuba gear rental', 'PADI instructor', '2-tank dive', 'Underwater photos', 'Hot chocolate on boat'],
            host: { name: 'Diego Vargas', photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=200&q=80', role: 'PADI Divemaster & naturalist', contact: 'diego@wayfare.travel' }
          },
          {
            id: 'ec-yacht', name: 'Private yacht sunset cruise', emoji: '\u{1F6E5}\u{FE0F}',
            description: 'Upgrade to a private yacht for a sunset cruise with champagne, ceviche, and dolphins.',
            price: 350, popular: false, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1540946485063-a40da27545f8?w=800&q=80',
            duration: '3 hours',
            timeOfDay: 'Late afternoon, 4:00 PM',
            whatsIncluded: ['Private yacht (up to 8 guests)', 'Champagne & ceviche', 'Snorkeling stop', 'Sunset viewing', 'Captain & crew'],
          },
        ]
      }
    ],
    personalities: {
      foodie: ['ec-snorkel', 'ec-yacht'],
      adventure: ['ec-snorkel', 'ec-volcano', 'ec-dive', 'ec-kayak', 'ec-island'],
      culture: ['ec-tortoise', 'ec-lava', 'ec-island'],
      luxury: ['ec-yacht', 'ec-dive', 'ec-snorkel'],
    }
  },
  {
    id: 'patagonia',
    continent: 'South America',
    country: 'Patagonia',
    flag: '\u{1F1E6}\u{1F1F7}',
    title: 'Patagonia Wilderness Trek',
    tagline: 'Glaciers, peaks, and the edge of the world',
    heroImage: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80',
    basePrice: 4200,
    duration: 8,
    departureDate: 'Feb 8',
    departureDateFull: 'Feb 8\u201316, 2027',
    spotsLeft: 10,
    flightFrom: 'LAX',
    flightIncluded: 'Los Angeles \u2192 Buenos Aires \u2192 El Calafate (Round-trip, Economy)',
    flightPrice: 1600,
    flightBusiness: { label: 'Los Angeles \u2192 Buenos Aires \u2192 El Calafate (Round-trip, Business)', price: 5200 },
    hotels: [
      {
        segment: 'El Calafate',
        days: 'Day 1\u20134',
        nights: 3,
        base: { name: 'Mountain lodge near Lago Argentino', pricePerNight: 195, image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80', description: 'Cozy mountain lodge with lake views, fireplace lounge, and hearty Patagonian breakfast.' },
        upgrade: { name: 'Eolo Patagonia Spirit', pricePerNight: 480, image: 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800&q=80', description: 'All-inclusive luxury estancia on the steppe. Horseback riding, gourmet dining, and endless views in every direction.' },
      },
      {
        segment: 'Torres del Paine',
        days: 'Day 5\u20138',
        nights: 3,
        base: { name: 'Eco-dome glamping', pricePerNight: 175, image: 'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?w=800&q=80', description: 'Geodesic dome with panoramic views of the Paine massif. Heated, furnished, and surprisingly comfortable.' },
        upgrade: { name: 'Explora Torres del Paine', pricePerNight: 520, image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80', description: 'Award-winning all-inclusive lodge. Private guides, open bar, spa with mountain views, and 40+ curated explorations.' },
      },
    ],
    segments: [
      {
        name: 'El Calafate',
        days: 'Day 1\u20134',
        stay: { name: 'Mountain lodge near Lago Argentino', pricePerNight: 195, nights: 3, included: true },
        experiences: [
          {
            id: 'pa-glacier', name: 'Perito Moreno glacier trek', emoji: '\u{1F9CA}',
            description: 'Strap on crampons and walk on one of the world\'s few advancing glaciers. Whisky with glacier ice after.',
            price: 160, popular: true, popularPercent: 96, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1494783367193-149034c05e8f?w=800&q=80',
            duration: '8 hours',
            timeOfDay: 'Morning, 7:00 AM',
            whatsIncluded: ['Crampons & trekking gear', 'Certified ice guide', 'Glacier walk (1.5 hours on ice)', 'Whisky with 1000-year-old glacier ice', 'Boat transfer across lake', 'Packed lunch'],
            host: { name: 'Mateo Gonzalez', photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80', role: 'Certified glacier trekking guide', contact: 'mateo@wayfare.travel' }
          },
          {
            id: 'pa-horse', name: 'Estancia horseback riding', emoji: '\u{1F40E}',
            description: 'Ride through Patagonian steppe on an authentic gaucho ranch. Asado BBQ lunch included.',
            price: 130, popular: true, popularPercent: 82, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1553284965-83fd3e82fa5a?w=800&q=80',
            duration: '5 hours',
            timeOfDay: 'Morning, 9:00 AM',
            whatsIncluded: ['Horseback ride (2 hours)', 'Gaucho guide', 'Traditional asado BBQ lunch', 'Malbec wine pairing', 'Ranch tour & sheep shearing demo'],
            host: { name: 'Santiago Ruiz', photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=200&q=80', role: '4th-generation gaucho rancher', contact: 'santiago@wayfare.travel' }
          },
          {
            id: 'pa-boat', name: 'Glacier boat safari', emoji: '\u{1F6A4}',
            description: 'Cruise past icebergs and watch massive ice chunks calve into turquoise water.',
            price: 85, popular: true, popularPercent: 88, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80',
            duration: '3 hours',
            timeOfDay: 'Afternoon, 1:00 PM',
            whatsIncluded: ['Catamaran cruise', 'Hot chocolate & snacks', 'Close-up glacier viewing', 'Iceberg spotting', 'Wildlife narration'],
          },
          {
            id: 'pa-lodge', name: 'Luxury lodge upgrade', emoji: '\u{1F3E8}',
            description: 'Upgrade to a premium lodge with mountain views, hot tub, and gourmet dining.',
            price: 300, popular: false, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80',
            duration: '3 nights',
            timeOfDay: 'Check-in 3:00 PM',
            whatsIncluded: ['Premium room with lake view', 'Private hot tub', 'Gourmet breakfast & dinner', 'Complimentary bar', 'Guided nature walk'],
          },
        ]
      },
      {
        name: 'Torres del Paine',
        days: 'Day 5\u20138',
        stay: { name: 'Eco-dome glamping', pricePerNight: 175, nights: 3, included: true },
        experiences: [
          {
            id: 'pa-torres', name: 'Torres del Paine base hike', emoji: '\u{1F3D4}\u{FE0F}',
            description: 'The iconic 8-hour hike to the base of the granite towers. Sunrise at the viewpoint is life-changing.',
            price: 0, popular: true, popularPercent: 94, defaultOn: true, included: true,
            image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800&q=80',
            duration: '8\u201310 hours',
            timeOfDay: 'Pre-dawn, 4:00 AM',
            whatsIncluded: ['Certified park guide', 'Packed breakfast & lunch', 'Trekking poles available', 'Sunrise at the towers', 'National park entry'],
            host: { name: 'Camila Herrera', photo: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80', role: 'Torres del Paine certified guide', contact: 'camila@wayfare.travel' }
          },
          {
            id: 'pa-grey', name: 'Grey Glacier kayaking', emoji: '\u{1F6F6}',
            description: 'Kayak among icebergs on Grey Lake with the glacier as your backdrop.',
            price: 140, popular: true, popularPercent: 79, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=800&q=80',
            duration: '5 hours',
            timeOfDay: 'Morning, 8:00 AM',
            whatsIncluded: ['Tandem kayak', 'Dry suit & gear', 'Safety briefing & guide', 'Hot drinks & snack on shore', 'Iceberg close-ups'],
            host: { name: 'Mateo Gonzalez', photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80', role: 'Kayak & glacier guide', contact: 'mateo@wayfare.travel' }
          },
          {
            id: 'pa-puma', name: 'Puma tracking expedition', emoji: '\u{1F406}',
            description: 'Dawn expedition with expert trackers. 85% sighting rate. Patagonia\'s apex predator in the wild.',
            price: 250, popular: false, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1456926631375-92c8ce872def?w=800&q=80',
            duration: '6 hours',
            timeOfDay: 'Pre-dawn, 5:00 AM',
            whatsIncluded: ['Expert wildlife tracker', 'Binoculars & spotting scope', '4x4 vehicle', 'Breakfast in the field', 'Photography tips'],
            host: { name: 'Joaquin Torres', photo: 'https://images.unsplash.com/photo-1504257432389-52343af06ae3?w=200&q=80', role: 'Wildlife tracker & photographer', contact: 'joaquin@wayfare.travel' }
          },
          {
            id: 'pa-wine', name: 'Patagonian wine + asado night', emoji: '\u{1F377}',
            description: 'Traditional lamb asado over open fire paired with Malbec from local Patagonian vineyards.',
            price: 75, popular: true, popularPercent: 90, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=800&q=80',
            duration: '3 hours',
            timeOfDay: 'Evening, 7:00 PM',
            whatsIncluded: ['Whole lamb asado (slow-roasted)', '4 Patagonian wine tastings', 'Empanadas & chimichurri', 'Live folk music', 'Stargazing after dinner'],
          },
        ]
      }
    ],
    personalities: {
      foodie: ['pa-wine', 'pa-horse'],
      adventure: ['pa-glacier', 'pa-grey', 'pa-puma', 'pa-torres'],
      culture: ['pa-horse', 'pa-wine', 'pa-glacier'],
      luxury: ['pa-lodge', 'pa-grey', 'pa-puma', 'pa-wine'],
    }
  },
  {
    id: 'sanfrancisco',
    continent: 'North America',
    country: 'San Francisco',
    flag: '\u{1F1FA}\u{1F1F8}',
    title: 'San Francisco City Break',
    tagline: 'Tech, tacos, and the best bridge on Earth',
    heroImage: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=800&q=80',
    basePrice: 1400,
    duration: 5,
    departureDate: 'Dec 1',
    departureDateFull: 'Dec 1\u20136, 2026',
    spotsLeft: 20,
    flightFrom: 'NYC',
    flightIncluded: 'New York \u2192 San Francisco (Round-trip, Economy)',
    flightPrice: 800,
    flightBusiness: { label: 'New York \u2192 San Francisco (Round-trip, Business)', price: 2200 },
    hotels: [
      {
        segment: 'San Francisco',
        days: 'Day 1\u20135',
        nights: 4,
        base: { name: 'Design hotel in SOMA', pricePerNight: 180, image: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?w=800&q=80', description: 'Modern design hotel in the heart of SOMA. Walking distance to SFMOMA, rooftop bar, and curated mini-bar.' },
        upgrade: { name: 'The Ritz-Carlton San Francisco', pricePerNight: 450, image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80', description: 'Nob Hill landmark with city views, award-winning restaurant, and the most iconic lobby in San Francisco.' },
      },
    ],
    segments: [
      {
        name: 'San Francisco',
        days: 'Day 1\u20135',
        stay: { name: 'Design hotel in SOMA', pricePerNight: 180, nights: 4, included: true },
        experiences: [
          {
            id: 'sf-alcatraz', name: 'Alcatraz night tour', emoji: '\u{1F3F0}',
            description: 'The infamous island prison at night. Award-winning audio tour and views of the city skyline after dark.',
            price: 55, popular: true, popularPercent: 93, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=800&q=80',
            duration: '3 hours',
            timeOfDay: 'Evening, 5:30 PM',
            whatsIncluded: ['Round-trip ferry', 'Audio tour (award-winning)', 'Night access (limited availability)', 'City skyline views from island'],
          },
          {
            id: 'sf-napa', name: 'Napa Valley wine day trip', emoji: '\u{1F377}',
            description: 'Visit 3 premier wineries with a private driver. Includes tastings, cheese pairings, and lunch.',
            price: 195, popular: true, popularPercent: 88, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1506377247377-2a5b3b417ebb?w=800&q=80',
            duration: 'Full day (9 hours)',
            timeOfDay: 'Morning, 9:00 AM',
            whatsIncluded: ['Private driver/vehicle', '3 winery visits', 'Tastings at each (12+ wines)', 'Cheese & charcuterie pairing', 'Vineyard lunch', 'Hotel pickup/dropoff'],
            host: { name: 'Sarah Mitchell', photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?w=200&q=80', role: 'Certified sommelier & Napa guide', contact: 'sarah@wayfare.travel' }
          },
          {
            id: 'sf-mission', name: 'Mission District food crawl', emoji: '\u{1F32E}',
            description: 'Tacos, craft beer, and street art through SF\'s most vibrant neighborhood. 8 stops, 3 hours.',
            price: 65, popular: true, popularPercent: 85, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=800&q=80',
            duration: '3 hours',
            timeOfDay: 'Late morning, 11:00 AM',
            whatsIncluded: ['8 food stops', 'Taco tasting (4 spots)', 'Craft beer flight', 'Street art walking tour', 'Local history narration'],
            host: { name: 'Marcus Chen', photo: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=200&q=80', role: 'SF food writer & neighborhood guide', contact: 'marcus@wayfare.travel' }
          },
          {
            id: 'sf-coast', name: 'Highway 1 coastal drive', emoji: '\u{1F3CE}\u{FE0F}',
            description: 'Convertible rental down the Pacific Coast Highway. Stop at Half Moon Bay and Devil\'s Slide.',
            price: 140, popular: true, popularPercent: 80, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1449034446853-66c86144b0ad?w=800&q=80',
            duration: '6 hours',
            timeOfDay: 'Morning, 8:00 AM',
            whatsIncluded: ['Convertible rental (full day)', 'Curated route guide', 'Half Moon Bay stop', 'Devil\'s Slide trail', 'Coastal caf\u00e9 lunch recommendation'],
          },
          {
            id: 'sf-bike', name: 'Golden Gate Bridge bike ride', emoji: '\u{1F6B4}',
            description: 'Cycle across the Golden Gate and down to Sausalito. Ferry back with waterfront views.',
            price: 45, popular: true, popularPercent: 91, defaultOn: true,
            image: 'https://images.unsplash.com/photo-1449034446853-66c86144b0ad?w=800&q=80',
            duration: '4 hours',
            timeOfDay: 'Morning, 9:00 AM',
            whatsIncluded: ['Bike rental (hybrid or e-bike)', 'Helmet & lock', 'Route map', 'Ferry ticket Sausalito \u2192 SF', 'Sausalito lunch recommendation'],
          },
          {
            id: 'sf-tech', name: 'Silicon Valley tech tour', emoji: '\u{1F4BB}',
            description: 'Visit the Apple Park visitor center, Google campus, and the garage where HP started.',
            price: 80, popular: false, defaultOn: false,
            image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80',
            duration: '5 hours',
            timeOfDay: 'Morning, 10:00 AM',
            whatsIncluded: ['Private transport', 'Apple Park Visitor Center', 'Google campus (exterior & store)', 'HP Garage (birthplace of Silicon Valley)', 'Stanford campus walk', 'Tech history narration'],
            host: { name: 'David Park', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80', role: 'Former tech founder & Valley historian', contact: 'david@wayfare.travel' }
          },
        ]
      }
    ],
    personalities: {
      foodie: ['sf-mission', 'sf-napa'],
      adventure: ['sf-coast', 'sf-bike', 'sf-alcatraz'],
      culture: ['sf-alcatraz', 'sf-tech', 'sf-mission'],
      luxury: ['sf-napa', 'sf-coast'],
    }
  }
];

export const personalityLabels = {
  foodie: { label: 'Food Lover', emoji: '\u{1F35C}' },
  adventure: { label: 'Adventure', emoji: '\u{1F3D4}\u{FE0F}' },
  culture: { label: 'Culture', emoji: '\u{1F3CE}\u{FE0F}' },
  luxury: { label: 'Luxury', emoji: '\u{1F48E}' },
};
