-- PrepVault Database Schema
-- Run this in Supabase SQL Editor to set up all tables

-- ================================================================
-- PROFILES (extends auth.users)
-- ================================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar TEXT,
  climate TEXT DEFAULT 'temperate',
  people INTEGER DEFAULT 4,
  prop_address TEXT,
  active_property_id TEXT DEFAULT 'prop1',
  pin_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, climate, people)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'climate', 'temperate'),
    COALESCE((new.raw_user_meta_data->>'people')::int, 4)
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ================================================================
-- PROPERTIES (multi-property support)
-- ================================================================
CREATE TABLE IF NOT EXISTS properties (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'home',
  icon TEXT DEFAULT '🏠',
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own properties" ON properties FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- ITEMS (inventory)
-- ================================================================
CREATE TABLE IF NOT EXISTS items (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL DEFAULT 'prop1',
  category TEXT NOT NULL,
  sub_type TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER DEFAULT 1,
  location TEXT,
  fields JSONB DEFAULT '{}',
  added_date DATE DEFAULT CURRENT_DATE,
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  version INTEGER DEFAULT 1,
  PRIMARY KEY (id, user_id)
);

ALTER TABLE items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own items" ON items FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_items_user_category ON items(user_id, category);
CREATE INDEX idx_items_user_updated ON items(user_id, updated_at DESC);

-- ================================================================
-- MAP PINS
-- ================================================================
CREATE TABLE IF NOT EXISTS map_pins (
  id TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  layer TEXT NOT NULL,
  type TEXT NOT NULL,
  x DOUBLE PRECISION NOT NULL,
  y DOUBLE PRECISION NOT NULL,
  label TEXT,
  notes TEXT,
  assignee TEXT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (id, user_id)
);

ALTER TABLE map_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own pins" ON map_pins FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- COMMUNITIES
-- ================================================================
CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  invite_code TEXT UNIQUE NOT NULL DEFAULT substring(gen_random_uuid()::text, 1, 8),
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- COMMUNITY MEMBERS
-- ================================================================
CREATE TABLE IF NOT EXISTS community_members (
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  call_sign TEXT,
  skills TEXT,
  joined_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);

ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read own community" ON community_members FOR SELECT
  USING (community_id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid()));
CREATE POLICY "Users can join communities" ON community_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave communities" ON community_members FOR DELETE USING (auth.uid() = user_id);

-- Community read policy (members can see their communities)
CREATE POLICY "Members can read communities" ON communities FOR SELECT
  USING (id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid()));
CREATE POLICY "Anyone can create communities" ON communities FOR INSERT WITH CHECK (auth.uid() = created_by);

-- ================================================================
-- MESSAGES (chat)
-- ================================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  display_name TEXT,
  text TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read community messages" ON messages FOR SELECT
  USING (community_id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can send messages" ON messages FOR INSERT
  WITH CHECK (auth.uid() = user_id AND community_id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid()));
CREATE INDEX idx_messages_community_time ON messages(community_id, created_at DESC);

-- ================================================================
-- LOCATION SHARES
-- ================================================================
CREATE TABLE IF NOT EXISTS location_shares (
  user_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  community_id UUID REFERENCES communities(id),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  battery INTEGER,
  status TEXT DEFAULT 'home',
  sharing BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE location_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read community locations" ON location_shares FOR SELECT
  USING (community_id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid()));
CREATE POLICY "Users can update own location" ON location_shares FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- TRADE OFFERS
-- ================================================================
CREATE TABLE IF NOT EXISTS trade_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  offer_type TEXT DEFAULT 'offer',
  have TEXT NOT NULL,
  want TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trade_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can read community trades" ON trade_offers FOR SELECT
  USING (community_id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can create trades" ON trade_offers FOR INSERT
  WITH CHECK (auth.uid() = user_id AND community_id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid()));
CREATE POLICY "Owners can update trades" ON trade_offers FOR UPDATE USING (auth.uid() = user_id);

-- ================================================================
-- TRADE MESSAGES
-- ================================================================
CREATE TABLE IF NOT EXISTS trade_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID REFERENCES trade_offers(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE trade_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Trade participants can read" ON trade_messages FOR SELECT
  USING (trade_id IN (SELECT id FROM trade_offers WHERE community_id IN (SELECT community_id FROM community_members WHERE user_id = auth.uid())));
CREATE POLICY "Members can send trade messages" ON trade_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ================================================================
-- SMART HOME TOKENS (server-side only)
-- ================================================================
CREATE TABLE IF NOT EXISTS smart_home_tokens (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  PRIMARY KEY (user_id, provider)
);

ALTER TABLE smart_home_tokens ENABLE ROW LEVEL SECURITY;
-- Only service role can access tokens (no client-side access)
CREATE POLICY "No direct access to tokens" ON smart_home_tokens FOR ALL USING (false);

-- ================================================================
-- ENABLE REALTIME
-- ================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE location_shares;
ALTER PUBLICATION supabase_realtime ADD TABLE trade_offers;
ALTER PUBLICATION supabase_realtime ADD TABLE trade_messages;
