export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      brand_members: {
        Row: {
          brand_id: string
          created_at: string
          role: Database["public"]["Enums"]["brand_role"]
          user_id: string
        }
        Insert: {
          brand_id: string
          created_at?: string
          role?: Database["public"]["Enums"]["brand_role"]
          user_id: string
        }
        Update: {
          brand_id?: string
          created_at?: string
          role?: Database["public"]["Enums"]["brand_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_members_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_money"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "brand_members_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          slug: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          slug: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          slug?: string
          verified?: boolean
        }
        Relationships: []
      }
      campaign_shortlist: {
        Row: {
          added_at: string
          campaign_id: string
          creator_id: string
          offer_id: string | null
        }
        Insert: {
          added_at?: string
          campaign_id: string
          creator_id: string
          offer_id?: string | null
        }
        Update: {
          added_at?: string
          campaign_id?: string
          creator_id?: string
          offer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_shortlist_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_shortlist_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_wallet"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "campaign_shortlist_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          brand_id: string
          brief: string
          budget_cents: number
          created_at: string
          id: string
          items: Json
          status: string
          title: string
        }
        Insert: {
          brand_id: string
          brief?: string
          budget_cents: number
          created_at?: string
          id?: string
          items: Json
          status?: string
          title: string
        }
        Update: {
          brand_id?: string
          brief?: string
          budget_cents?: number
          created_at?: string
          id?: string
          items?: Json
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_money"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "campaigns_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          last_read_seq: number
          side: Database["public"]["Enums"]["side"]
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          last_read_seq?: number
          side: Database["public"]["Enums"]["side"]
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          last_read_seq?: number
          side?: Database["public"]["Enums"]["side"]
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          brand_id: string
          created_at: string
          creator_id: string
          id: string
          last_message_at: string | null
          last_message_seq: number
        }
        Insert: {
          brand_id: string
          created_at?: string
          creator_id: string
          id?: string
          last_message_at?: string | null
          last_message_seq?: number
        }
        Update: {
          brand_id?: string
          created_at?: string
          creator_id?: string
          id?: string
          last_message_at?: string | null
          last_message_seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_money"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "conversations_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_wallet"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "conversations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      creators: {
        Row: {
          avatar_url: string | null
          bio: string
          created_at: string
          display_name: string
          handle: string
          id: string
          owner_id: string
          platforms: Json
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          display_name: string
          handle: string
          id?: string
          owner_id: string
          platforms?: Json
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          created_at?: string
          display_name?: string
          handle?: string
          id?: string
          owner_id?: string
          platforms?: Json
        }
        Relationships: [
          {
            foreignKeyName: "creators_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_periods: {
        Row: {
          deal_id: string
          ends_on: string | null
          id: string
          label: string
          renewal_id: string | null
          seq: number
          starts_on: string | null
        }
        Insert: {
          deal_id: string
          ends_on?: string | null
          id?: string
          label: string
          renewal_id?: string | null
          seq: number
          starts_on?: string | null
        }
        Update: {
          deal_id?: string
          ends_on?: string | null
          id?: string
          label?: string
          renewal_id?: string | null
          seq?: number
          starts_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_periods_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deal_periods_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_periods_renewal_fk"
            columns: ["renewal_id"]
            isOneToOne: false
            referencedRelation: "renewals"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          amount_cents: number
          brand_id: string
          completed_at: string | null
          contract_label: string | null
          created_at: string
          creator_id: string
          demo_key: string | null
          ends_on: string | null
          id: string
          offer_id: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["deal_status"]
          title: string
          type: Database["public"]["Enums"]["deal_type"]
        }
        Insert: {
          amount_cents: number
          brand_id: string
          completed_at?: string | null
          contract_label?: string | null
          created_at?: string
          creator_id: string
          demo_key?: string | null
          ends_on?: string | null
          id?: string
          offer_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          title: string
          type?: Database["public"]["Enums"]["deal_type"]
        }
        Update: {
          amount_cents?: number
          brand_id?: string
          completed_at?: string | null
          contract_label?: string | null
          created_at?: string
          creator_id?: string
          demo_key?: string | null
          ends_on?: string | null
          id?: string
          offer_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["deal_status"]
          title?: string
          type?: Database["public"]["Enums"]["deal_type"]
        }
        Relationships: [
          {
            foreignKeyName: "deals_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_money"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "deals_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_wallet"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "deals_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: true
            referencedRelation: "offer_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: true
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      deliverables: {
        Row: {
          amount_cents: number
          deal_id: string
          done_at: string | null
          due_on: string | null
          id: string
          label: string
          milestone_id: string
          seq: number
          status: Database["public"]["Enums"]["deliverable_status"]
        }
        Insert: {
          amount_cents: number
          deal_id: string
          done_at?: string | null
          due_on?: string | null
          id?: string
          label: string
          milestone_id: string
          seq: number
          status?: Database["public"]["Enums"]["deliverable_status"]
        }
        Update: {
          amount_cents?: number
          deal_id?: string
          done_at?: string | null
          due_on?: string | null
          id?: string
          label?: string
          milestone_id?: string
          seq?: number
          status?: Database["public"]["Enums"]["deliverable_status"]
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "deliverables_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          actor_id: string | null
          actor_side: Database["public"]["Enums"]["side"] | null
          amount_cents: number | null
          at: string
          brand_id: string | null
          creator_id: string | null
          data: Json
          deal_id: string | null
          id: number
          kind: string
          offer_id: string | null
          payment_id: string | null
          proof_id: string | null
          renewal_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_side?: Database["public"]["Enums"]["side"] | null
          amount_cents?: number | null
          at?: string
          brand_id?: string | null
          creator_id?: string | null
          data?: Json
          deal_id?: string | null
          id?: never
          kind: string
          offer_id?: string | null
          payment_id?: string | null
          proof_id?: string | null
          renewal_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_side?: Database["public"]["Enums"]["side"] | null
          amount_cents?: number | null
          at?: string
          brand_id?: string | null
          creator_id?: string | null
          data?: Json
          deal_id?: string | null
          id?: never
          kind?: string
          offer_id?: string | null
          payment_id?: string | null
          proof_id?: string | null
          renewal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_money"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "events_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_wallet"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "events_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offer_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_proof_id_fkey"
            columns: ["proof_id"]
            isOneToOne: false
            referencedRelation: "proofs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_renewal_id_fkey"
            columns: ["renewal_id"]
            isOneToOne: false
            referencedRelation: "renewals"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account: string
          amount_cents: number
          created_at: string
          deal_id: string | null
          id: number
          memo: string
          payment_id: string | null
          payout_id: string | null
          release_id: string | null
          txn_id: string
        }
        Insert: {
          account: string
          amount_cents: number
          created_at?: string
          deal_id?: string | null
          id?: never
          memo?: string
          payment_id?: string | null
          payout_id?: string | null
          release_id?: string | null
          txn_id: string
        }
        Update: {
          account?: string
          amount_cents?: number
          created_at?: string
          deal_id?: string | null
          id?: never
          memo?: string
          payment_id?: string | null
          payout_id?: string | null
          release_id?: string | null
          txn_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_entries_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "ledger_entries_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_payout_id_fkey"
            columns: ["payout_id"]
            isOneToOne: false
            referencedRelation: "payouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ledger_entries_release_id_fkey"
            columns: ["release_id"]
            isOneToOne: false
            referencedRelation: "releases"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          id: string
          sender_id: string
          sender_side: Database["public"]["Enums"]["side"]
          seq: number
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          sender_id: string
          sender_side: Database["public"]["Enums"]["side"]
          seq: number
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          sender_id?: string
          sender_side?: Database["public"]["Enums"]["side"]
          seq?: number
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      milestones: {
        Row: {
          amount_cents: number
          created_at: string
          deal_id: string
          due_on: string | null
          id: string
          label: string
          payment_id: string | null
          period_id: string | null
          released_cents: number
          renewal_id: string | null
          seq: number
          status: Database["public"]["Enums"]["milestone_status"]
        }
        Insert: {
          amount_cents: number
          created_at?: string
          deal_id: string
          due_on?: string | null
          id?: string
          label: string
          payment_id?: string | null
          period_id?: string | null
          released_cents?: number
          renewal_id?: string | null
          seq: number
          status?: Database["public"]["Enums"]["milestone_status"]
        }
        Update: {
          amount_cents?: number
          created_at?: string
          deal_id?: string
          due_on?: string | null
          id?: string
          label?: string
          payment_id?: string | null
          period_id?: string | null
          released_cents?: number
          renewal_id?: string | null
          seq?: number
          status?: Database["public"]["Enums"]["milestone_status"]
        }
        Relationships: [
          {
            foreignKeyName: "milestones_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "milestones_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_payment_fk"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "deal_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "milestones_renewal_fk"
            columns: ["renewal_id"]
            isOneToOne: false
            referencedRelation: "renewals"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          event_id: number | null
          id: number
          kind: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id?: number | null
          id?: never
          kind: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: number | null
          id?: never
          kind?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offer_versions: {
        Row: {
          amount_cents: number
          by_side: Database["public"]["Enums"]["side"]
          created_at: string
          created_by: string
          items: Json
          note: string
          offer_id: string
          version: number
        }
        Insert: {
          amount_cents: number
          by_side: Database["public"]["Enums"]["side"]
          created_at?: string
          created_by: string
          items: Json
          note?: string
          offer_id: string
          version: number
        }
        Update: {
          amount_cents?: number
          by_side?: Database["public"]["Enums"]["side"]
          created_at?: string
          created_by?: string
          items?: Json
          note?: string
          offer_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "offer_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_versions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offer_board"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_versions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          accepted_at: string | null
          accepted_by_side: Database["public"]["Enums"]["side"] | null
          brand_id: string
          campaign_id: string | null
          close_reason: string | null
          closed_at: string | null
          closed_by_side: Database["public"]["Enums"]["side"] | null
          created_at: string
          created_by: string
          creator_id: string
          deal_id: string | null
          expires_at: string
          id: string
          package_id: string | null
          previous_deal_id: string | null
          reply_hours: number
          source: Database["public"]["Enums"]["offer_source"]
          status: Database["public"]["Enums"]["offer_status"]
          title: string
          versions: number
        }
        Insert: {
          accepted_at?: string | null
          accepted_by_side?: Database["public"]["Enums"]["side"] | null
          brand_id: string
          campaign_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by_side?: Database["public"]["Enums"]["side"] | null
          created_at?: string
          created_by: string
          creator_id: string
          deal_id?: string | null
          expires_at: string
          id?: string
          package_id?: string | null
          previous_deal_id?: string | null
          reply_hours?: number
          source?: Database["public"]["Enums"]["offer_source"]
          status: Database["public"]["Enums"]["offer_status"]
          title: string
          versions?: number
        }
        Update: {
          accepted_at?: string | null
          accepted_by_side?: Database["public"]["Enums"]["side"] | null
          brand_id?: string
          campaign_id?: string | null
          close_reason?: string | null
          closed_at?: string | null
          closed_by_side?: Database["public"]["Enums"]["side"] | null
          created_at?: string
          created_by?: string
          creator_id?: string
          deal_id?: string | null
          expires_at?: string
          id?: string
          package_id?: string | null
          previous_deal_id?: string | null
          reply_hours?: number
          source?: Database["public"]["Enums"]["offer_source"]
          status?: Database["public"]["Enums"]["offer_status"]
          title?: string
          versions?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_money"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "offers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_wallet"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "offers_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_deal_fk"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "offers_deal_fk"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_previous_deal_fk"
            columns: ["previous_deal_id"]
            isOneToOne: false
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "offers_previous_deal_fk"
            columns: ["previous_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      packages: {
        Row: {
          active: boolean
          code: string | null
          created_at: string
          creator_id: string
          description: string
          id: string
          items: Json
          length_label: string | null
          price_cents: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          created_at?: string
          creator_id: string
          description?: string
          id?: string
          items: Json
          length_label?: string | null
          price_cents: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string | null
          created_at?: string
          creator_id?: string
          description?: string
          id?: string
          items?: Json
          length_label?: string | null
          price_cents?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "packages_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_wallet"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "packages_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_milestones: {
        Row: {
          amount_cents: number
          milestone_id: string
          payment_id: string
        }
        Insert: {
          amount_cents: number
          milestone_id: string
          payment_id: string
        }
        Update: {
          amount_cents?: number
          milestone_id?: string
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_milestones_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_milestones_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          base_cents: number
          brand_id: string
          created_at: string
          created_by: string | null
          deal_id: string
          failed_at: string | null
          fee_basis_cents: number
          fee_cents: number
          fees_before_cents: number
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          method_label: string
          provider: string
          provider_ref: string | null
          reference: string
          seq: number
          status: Database["public"]["Enums"]["payment_status"]
          succeeded_at: string | null
          total_cents: number
        }
        Insert: {
          base_cents: number
          brand_id: string
          created_at?: string
          created_by?: string | null
          deal_id: string
          failed_at?: string | null
          fee_basis_cents?: number
          fee_cents: number
          fees_before_cents?: number
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          method_label?: string
          provider: string
          provider_ref?: string | null
          reference: string
          seq: number
          status: Database["public"]["Enums"]["payment_status"]
          succeeded_at?: string | null
          total_cents: number
        }
        Update: {
          base_cents?: number
          brand_id?: string
          created_at?: string
          created_by?: string | null
          deal_id?: string
          failed_at?: string | null
          fee_basis_cents?: number
          fee_cents?: number
          fees_before_cents?: number
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          method_label?: string
          provider?: string
          provider_ref?: string | null
          reference?: string
          seq?: number
          status?: Database["public"]["Enums"]["payment_status"]
          succeeded_at?: string | null
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "payments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_money"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "payments_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "payments_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          creator_id: string
          failed_at: string | null
          fee_cents: number
          id: string
          instant: boolean
          net_cents: number
          paid_at: string | null
          provider: string
          provider_ref: string | null
          status: Database["public"]["Enums"]["payout_status"]
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          creator_id: string
          failed_at?: string | null
          fee_cents?: number
          id?: string
          instant?: boolean
          net_cents: number
          paid_at?: string | null
          provider: string
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          creator_id?: string
          failed_at?: string | null
          fee_cents?: number
          id?: string
          instant?: boolean
          net_cents?: number
          paid_at?: string | null
          provider?: string
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payout_status"]
        }
        Relationships: [
          {
            foreignKeyName: "payouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_wallet"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "payouts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          user_id: string
        }
        Insert: {
          user_id: string
        }
        Update: {
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      proofs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          changes_at: string | null
          changes_note: string | null
          deal_id: string
          deliverable_id: string
          file_path: string | null
          id: string
          link_url: string | null
          milestone_id: string
          note: string
          release_at: string | null
          released_at: string | null
          review_started_at: string
          status: Database["public"]["Enums"]["proof_status"]
          submitted_at: string
          submitted_by: string
          value_cents: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          changes_at?: string | null
          changes_note?: string | null
          deal_id: string
          deliverable_id: string
          file_path?: string | null
          id?: string
          link_url?: string | null
          milestone_id: string
          note?: string
          release_at?: string | null
          released_at?: string | null
          review_started_at?: string
          status?: Database["public"]["Enums"]["proof_status"]
          submitted_at?: string
          submitted_by: string
          value_cents: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          changes_at?: string | null
          changes_note?: string | null
          deal_id?: string
          deliverable_id?: string
          file_path?: string | null
          id?: string
          link_url?: string | null
          milestone_id?: string
          note?: string
          release_at?: string | null
          released_at?: string | null
          review_started_at?: string
          status?: Database["public"]["Enums"]["proof_status"]
          submitted_at?: string
          submitted_by?: string
          value_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "proofs_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proofs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "proofs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proofs_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proofs_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "proofs_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          by_side: Database["public"]["Enums"]["side"]
          comment: string
          created_at: string
          created_by: string
          deal_id: string
          id: string
          score: number
        }
        Insert: {
          by_side: Database["public"]["Enums"]["side"]
          comment?: string
          created_at?: string
          created_by: string
          deal_id: string
          id?: string
          score: number
        }
        Update: {
          by_side?: Database["public"]["Enums"]["side"]
          comment?: string
          created_at?: string
          created_by?: string
          deal_id?: string
          id?: string
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "ratings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "ratings_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      releases: {
        Row: {
          creator_id: string
          deal_id: string
          fee_cents: number
          gross_cents: number
          id: string
          milestone_id: string
          net_cents: number
          proof_id: string
          released_at: string
        }
        Insert: {
          creator_id: string
          deal_id: string
          fee_cents: number
          gross_cents: number
          id?: string
          milestone_id: string
          net_cents: number
          proof_id: string
          released_at: string
        }
        Update: {
          creator_id?: string
          deal_id?: string
          fee_cents?: number
          gross_cents?: number
          id?: string
          milestone_id?: string
          net_cents?: number
          proof_id?: string
          released_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "releases_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_wallet"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "releases_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "releases_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "releases_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "releases_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "releases_proof_id_fkey"
            columns: ["proof_id"]
            isOneToOne: true
            referencedRelation: "proofs"
            referencedColumns: ["id"]
          },
        ]
      }
      renewals: {
        Row: {
          answered_at: string | null
          answered_by: string | null
          auto_renew: boolean
          by_side: Database["public"]["Enums"]["side"]
          created_at: string
          created_by: string
          deal_id: string
          id: string
          months: number
          price_cents: number
          status: Database["public"]["Enums"]["renewal_status"]
        }
        Insert: {
          answered_at?: string | null
          answered_by?: string | null
          auto_renew?: boolean
          by_side: Database["public"]["Enums"]["side"]
          created_at?: string
          created_by: string
          deal_id: string
          id?: string
          months: number
          price_cents: number
          status: Database["public"]["Enums"]["renewal_status"]
        }
        Update: {
          answered_at?: string | null
          answered_by?: string | null
          auto_renew?: boolean
          by_side?: Database["public"]["Enums"]["side"]
          created_at?: string
          created_by?: string
          deal_id?: string
          id?: string
          months?: number
          price_cents?: number
          status?: Database["public"]["Enums"]["renewal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "renewals_answered_by_fkey"
            columns: ["answered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewals_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "renewals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      brand_money: {
        Row: {
          brand_id: string | null
          clearing_cents: number | null
          fees_cents: number | null
          in_escrow_cents: number | null
          name: string | null
          not_funded_cents: number | null
          paid_cents: number | null
          released_cents: number | null
          total_cents: number | null
        }
        Relationships: []
      }
      conversation_timeline: {
        Row: {
          amount_cents: number | null
          at: string | null
          body: string | null
          brand_id: string | null
          conversation_id: string | null
          creator_id: string | null
          data: Json | null
          deal_id: string | null
          kind: string | null
          offer_id: string | null
          ref: string | null
          side: Database["public"]["Enums"]["side"] | null
        }
        Relationships: []
      }
      creator_wallet: {
        Row: {
          available_cents: number | null
          creator_id: string | null
          display_name: string | null
          earned_cents: number | null
          fees_cents: number | null
          in_escrow_cents: number | null
          paid_out_cents: number | null
          payouts_pending_cents: number | null
          released_cents: number | null
        }
        Insert: {
          available_cents?: never
          creator_id?: string | null
          display_name?: string | null
          earned_cents?: never
          fees_cents?: never
          in_escrow_cents?: never
          paid_out_cents?: never
          payouts_pending_cents?: never
          released_cents?: never
        }
        Update: {
          available_cents?: never
          creator_id?: string | null
          display_name?: string | null
          earned_cents?: never
          fees_cents?: never
          in_escrow_cents?: never
          paid_out_cents?: never
          payouts_pending_cents?: never
          released_cents?: never
        }
        Relationships: []
      }
      deal_money: {
        Row: {
          brand_id: string | null
          clearing_cents: number | null
          creator_id: string | null
          deal_id: string | null
          funded_cents: number | null
          in_escrow_cents: number | null
          next_to_fund: string | null
          not_funded_cents: number | null
          released_cents: number | null
          status: Database["public"]["Enums"]["deal_status"] | null
          title: string | null
          total_cents: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_money"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "deals_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_wallet"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "deals_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
        ]
      }
      my_seats: {
        Row: {
          brand_id: string | null
          creator_id: string | null
          name: string | null
          role: Database["public"]["Enums"]["brand_role"] | null
          side: Database["public"]["Enums"]["side"] | null
        }
        Relationships: []
      }
      offer_board: {
        Row: {
          accepted_at: string | null
          accepted_by_side: Database["public"]["Enums"]["side"] | null
          amount_cents: number | null
          brand_id: string | null
          campaign_id: string | null
          changes_left: number | null
          close_reason: string | null
          closed_at: string | null
          closed_by_side: Database["public"]["Enums"]["side"] | null
          created_at: string | null
          creator_id: string | null
          deal_id: string | null
          expires_at: string | null
          id: string | null
          items: Json | null
          last_by_side: Database["public"]["Enums"]["side"] | null
          last_version_at: string | null
          note: string | null
          package_id: string | null
          previous_amount_cents: number | null
          previous_deal_id: string | null
          source: Database["public"]["Enums"]["offer_source"] | null
          status: Database["public"]["Enums"]["offer_status"] | null
          title: string | null
          versions: number | null
          waiting_on: Database["public"]["Enums"]["side"] | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brand_money"
            referencedColumns: ["brand_id"]
          },
          {
            foreignKeyName: "offers_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creator_wallet"
            referencedColumns: ["creator_id"]
          },
          {
            foreignKeyName: "offers_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "creators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_deal_fk"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "offers_deal_fk"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_previous_deal_fk"
            columns: ["previous_deal_id"]
            isOneToOne: false
            referencedRelation: "deal_money"
            referencedColumns: ["deal_id"]
          },
          {
            foreignKeyName: "offers_previous_deal_fk"
            columns: ["previous_deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          amount_cents: number | null
          brand_id: string | null
          creator_id: string | null
          due_at: string | null
          kind: string | null
          ref_id: string | null
          side: Database["public"]["Enums"]["side"] | null
          title: string | null
        }
        Relationships: []
      }
      wallet_lines: {
        Row: {
          amount_cents: number | null
          at: string | null
          creator_id: string | null
          deal_id: string | null
          deliverable: string | null
          kind: string | null
          payout_id: string | null
          release_id: string | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_offer: {
        Args: { p_as: Database["public"]["Enums"]["side"]; p_offer: string }
        Returns: string
      }
      answer_renewal: {
        Args: {
          p_accept: boolean
          p_as: Database["public"]["Enums"]["side"]
          p_renewal: string
        }
        Returns: undefined
      }
      approve_proof: {
        Args: { p_proof: string; p_undo_seconds?: number }
        Returns: string
      }
      book_again: { Args: { p_deal: string; p_note?: string }; Returns: string }
      book_package: {
        Args: {
          p_brand: string
          p_expected_price_cents?: number
          p_note?: string
          p_package: string
        }
        Returns: string
      }
      complete_payout: {
        Args: { p_paid: boolean; p_payout: string; p_provider_ref?: string }
        Returns: boolean
      }
      confirm_payment: {
        Args: { p_payment: string; p_provider_ref?: string }
        Returns: boolean
      }
      counter_offer: {
        Args: {
          p_amount_cents: number
          p_as: Database["public"]["Enums"]["side"]
          p_items?: Json
          p_note?: string
          p_offer: string
        }
        Returns: number
      }
      create_brand: {
        Args: { p_name: string; p_slug?: string }
        Returns: string
      }
      create_creator_profile: {
        Args: { p_display_name: string; p_handle: string }
        Returns: string
      }
      decline_offer: {
        Args: {
          p_as: Database["public"]["Enums"]["side"]
          p_offer: string
          p_reason?: string
        }
        Returns: undefined
      }
      expire_offers: { Args: never; Returns: number }
      fail_payment: {
        Args: { p_payment: string; p_reason?: string }
        Returns: boolean
      }
      fee_step: {
        Args: { p_amount: number; p_before: number }
        Returns: number
      }
      finalize_release: { Args: { p_proof: string }; Returns: string }
      five_percent: { Args: { p_cents: number }; Returns: number }
      fund_milestones: {
        Args: {
          p_deal: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_method_label?: string
          p_milestones?: string[]
          p_scope?: string
        }
        Returns: string
      }
      instant_payout_fee: { Args: { p_cents: number }; Returns: number }
      items_valid: { Args: { p: Json }; Returns: boolean }
      mark_notifications_read: { Args: { p_ids?: number[] }; Returns: number }
      mark_read: {
        Args: {
          p_as: Database["public"]["Enums"]["side"]
          p_conversation: string
          p_upto_seq?: number
        }
        Returns: number
      }
      offer_renewal: {
        Args: {
          p_auto_renew?: boolean
          p_deal: string
          p_months: number
          p_price_cents: number
        }
        Returns: string
      }
      pitch_offer: {
        Args: {
          p_amount_cents?: number
          p_brand: string
          p_creator: string
          p_items?: Json
          p_note?: string
          p_package?: string
          p_title?: string
        }
        Returns: string
      }
      rate_deal: {
        Args: {
          p_as: Database["public"]["Enums"]["side"]
          p_comment?: string
          p_deal: string
          p_score: number
        }
        Returns: string
      }
      release_due: { Args: never; Returns: number }
      request_changes: {
        Args: { p_note?: string; p_proof: string }
        Returns: undefined
      }
      request_payout: {
        Args: {
          p_amount_cents?: number
          p_creator: string
          p_instant?: boolean
        }
        Returns: string
      }
      request_renewal: {
        Args: { p_deal: string; p_months?: number; p_price_cents?: number }
        Returns: string
      }
      send_message: {
        Args: {
          p_as: Database["public"]["Enums"]["side"]
          p_body: string
          p_brand: string
          p_creator: string
        }
        Returns: string
      }
      send_offer: {
        Args: {
          p_amount_cents: number
          p_brand: string
          p_campaign?: string
          p_creator: string
          p_items: Json
          p_note?: string
          p_title: string
        }
        Returns: string
      }
      simulate_payment: {
        Args: { p_outcome?: string; p_payment: string }
        Returns: boolean
      }
      split_cents: {
        Args: { p_parts: number; p_total: number }
        Returns: number[]
      }
      submit_proof: {
        Args: {
          p_deliverable: string
          p_file_path?: string
          p_link_url?: string
          p_note?: string
        }
        Returns: string
      }
      undo_approval: { Args: { p_proof: string }; Returns: undefined }
      withdraw_offer: {
        Args: { p_as: Database["public"]["Enums"]["side"]; p_offer: string }
        Returns: undefined
      }
      withdraw_renewal: {
        Args: { p_as: Database["public"]["Enums"]["side"]; p_renewal: string }
        Returns: undefined
      }
    }
    Enums: {
      brand_role: "owner" | "admin" | "member"
      deal_status:
        | "awaiting_funding"
        | "in_progress"
        | "completed"
        | "cancelled"
      deal_type: "one_time" | "milestone" | "monthly"
      deliverable_status:
        | "upcoming"
        | "in_review"
        | "changes_requested"
        | "done"
      milestone_status:
        | "pending"
        | "processing"
        | "awaiting_wire"
        | "in_escrow"
        | "released"
      offer_source: "direct" | "package" | "campaign" | "pitch" | "book_again"
      offer_status:
        | "sent"
        | "countered"
        | "accepted"
        | "declined"
        | "withdrawn"
        | "expired"
      payment_method: "card" | "bank" | "wire"
      payment_status: "processing" | "awaiting_wire" | "succeeded" | "failed"
      payout_status: "pending" | "paid" | "failed"
      proof_status: "in_review" | "releasing" | "released" | "changes_requested"
      renewal_status:
        | "sent"
        | "requested"
        | "accepted"
        | "declined"
        | "withdrawn"
      side: "brand" | "creator"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      brand_role: ["owner", "admin", "member"],
      deal_status: [
        "awaiting_funding",
        "in_progress",
        "completed",
        "cancelled",
      ],
      deal_type: ["one_time", "milestone", "monthly"],
      deliverable_status: [
        "upcoming",
        "in_review",
        "changes_requested",
        "done",
      ],
      milestone_status: [
        "pending",
        "processing",
        "awaiting_wire",
        "in_escrow",
        "released",
      ],
      offer_source: ["direct", "package", "campaign", "pitch", "book_again"],
      offer_status: [
        "sent",
        "countered",
        "accepted",
        "declined",
        "withdrawn",
        "expired",
      ],
      payment_method: ["card", "bank", "wire"],
      payment_status: ["processing", "awaiting_wire", "succeeded", "failed"],
      payout_status: ["pending", "paid", "failed"],
      proof_status: ["in_review", "releasing", "released", "changes_requested"],
      renewal_status: [
        "sent",
        "requested",
        "accepted",
        "declined",
        "withdrawn",
      ],
      side: ["brand", "creator"],
    },
  },
} as const
