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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      action_items: {
        Row: {
          assignee: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          meeting_date: string | null
          meeting_summary: string | null
          priority: string
          source: string | null
          status: string
          steno_session_id: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_date?: string | null
          meeting_summary?: string | null
          priority?: string
          source?: string | null
          status?: string
          steno_session_id?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          meeting_date?: string | null
          meeting_summary?: string | null
          priority?: string
          source?: string | null
          status?: string
          steno_session_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "action_items_steno_session_id_fkey"
            columns: ["steno_session_id"]
            isOneToOne: false
            referencedRelation: "steno_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_users: {
        Row: {
          activated_at: string | null
          company: string | null
          created_at: string
          created_by: string | null
          email: string
          id: string
          invited_at: string | null
          last_contacted_at: string | null
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          signed_up_at: string | null
          source: string | null
          status: Database["public"]["Enums"]["beta_user_status"]
          tier: Database["public"]["Enums"]["beta_user_tier"]
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          invited_at?: string | null
          last_contacted_at?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          signed_up_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["beta_user_status"]
          tier?: Database["public"]["Enums"]["beta_user_tier"]
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          invited_at?: string | null
          last_contacted_at?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          signed_up_at?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["beta_user_status"]
          tier?: Database["public"]["Enums"]["beta_user_tier"]
          updated_at?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          attachments: Json | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_reminders: {
        Row: {
          contact_email: string | null
          contact_name: string
          created_at: string
          id: string
          last_action_at: string | null
          notes: string | null
          recurring: boolean
          reminder_date: string
          reminder_type: string
          steno_session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_email?: string | null
          contact_name: string
          created_at?: string
          id?: string
          last_action_at?: string | null
          notes?: string | null
          recurring?: boolean
          reminder_date: string
          reminder_type?: string
          steno_session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_email?: string | null
          contact_name?: string
          created_at?: string
          id?: string
          last_action_at?: string | null
          notes?: string | null
          recurring?: boolean
          reminder_date?: string
          reminder_type?: string
          steno_session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_reminders_steno_session_id_fkey"
            columns: ["steno_session_id"]
            isOneToOne: false
            referencedRelation: "steno_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          ai_summary: string | null
          ai_topics: string[] | null
          birthday: string | null
          company: string | null
          created_at: string
          email: string | null
          enriched_at: string | null
          id: string
          interaction_count: number
          is_vip: boolean
          last_interaction_at: string | null
          last_interaction_source: string | null
          last_interaction_summary: string | null
          name: string
          notes: string | null
          phone: string | null
          role: string | null
          stay_in_touch_days: number | null
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_summary?: string | null
          ai_topics?: string[] | null
          birthday?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          enriched_at?: string | null
          id?: string
          interaction_count?: number
          is_vip?: boolean
          last_interaction_at?: string | null
          last_interaction_source?: string | null
          last_interaction_summary?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          stay_in_touch_days?: number | null
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_summary?: string | null
          ai_topics?: string[] | null
          birthday?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          enriched_at?: string | null
          id?: string
          interaction_count?: number
          is_vip?: boolean
          last_interaction_at?: string | null
          last_interaction_source?: string | null
          last_interaction_summary?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          role?: string | null
          stay_in_touch_days?: number | null
          tags?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_briefings: {
        Row: {
          briefing_date: string
          created_at: string
          email_count: number | null
          id: string
          meeting_count: number | null
          summary: string
          urgent_items: number | null
          user_id: string
        }
        Insert: {
          briefing_date?: string
          created_at?: string
          email_count?: number | null
          id?: string
          meeting_count?: number | null
          summary: string
          urgent_items?: number | null
          user_id: string
        }
        Update: {
          briefing_date?: string
          created_at?: string
          email_count?: number | null
          id?: string
          meeting_count?: number | null
          summary?: string
          urgent_items?: number | null
          user_id?: string
        }
        Relationships: []
      }
      draft_actions: {
        Row: {
          body: string | null
          created_at: string
          gmail_message_id: string | null
          id: string
          in_reply_to: string | null
          metadata: Json | null
          status: string
          subject: string | null
          thread_id: string | null
          to_email: string | null
          to_name: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          gmail_message_id?: string | null
          id?: string
          in_reply_to?: string | null
          metadata?: Json | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_email?: string | null
          to_name?: string | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          gmail_message_id?: string | null
          id?: string
          in_reply_to?: string | null
          metadata?: Json | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          to_email?: string | null
          to_name?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_reminders: {
        Row: {
          created_at: string
          email_from: string
          email_snippet: string | null
          email_subject: string
          id: string
          remind_at: string
          status: string
          steno_session_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email_from: string
          email_snippet?: string | null
          email_subject: string
          id?: string
          remind_at: string
          status?: string
          steno_session_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email_from?: string
          email_snippet?: string | null
          email_subject?: string
          id?: string
          remind_at?: string
          status?: string
          steno_session_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_reminders_steno_session_id_fkey"
            columns: ["steno_session_id"]
            isOneToOne: false
            referencedRelation: "steno_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      email_snoozes: {
        Row: {
          created_at: string
          id: string
          message_id: string
          sender: string | null
          snippet: string | null
          status: string
          subject: string | null
          thread_id: string | null
          until_at: string
          updated_at: string
          user_id: string
          woken_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message_id: string
          sender?: string | null
          snippet?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          until_at: string
          updated_at?: string
          user_id: string
          woken_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message_id?: string
          sender?: string | null
          snippet?: string | null
          status?: string
          subject?: string | null
          thread_id?: string | null
          until_at?: string
          updated_at?: string
          user_id?: string
          woken_at?: string | null
        }
        Relationships: []
      }
      email_triage_preferences: {
        Row: {
          created_at: string
          custom_instructions: string | null
          dismiss_keywords: string[]
          dismiss_senders: string[]
          id: string
          learned_patterns: Json | null
          priority_keywords: string[]
          updated_at: string
          user_id: string
          vip_senders: string[]
        }
        Insert: {
          created_at?: string
          custom_instructions?: string | null
          dismiss_keywords?: string[]
          dismiss_senders?: string[]
          id?: string
          learned_patterns?: Json | null
          priority_keywords?: string[]
          updated_at?: string
          user_id: string
          vip_senders?: string[]
        }
        Update: {
          created_at?: string
          custom_instructions?: string | null
          dismiss_keywords?: string[]
          dismiss_senders?: string[]
          id?: string
          learned_patterns?: Json | null
          priority_keywords?: string[]
          updated_at?: string
          user_id?: string
          vip_senders?: string[]
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount_cents: number
          category: string | null
          created_at: string
          currency: string
          expense_date: string
          gmail_message_id: string | null
          id: string
          merchant: string | null
          notes: string | null
          receipt_url: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          category?: string | null
          created_at?: string
          currency?: string
          expense_date?: string
          gmail_message_id?: string | null
          id?: string
          merchant?: string | null
          notes?: string | null
          receipt_url?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          category?: string | null
          created_at?: string
          currency?: string
          expense_date?: string
          gmail_message_id?: string | null
          id?: string
          merchant?: string | null
          notes?: string | null
          receipt_url?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_oauth_tokens: {
        Row: {
          access_token: string
          created_at: string | null
          email: string | null
          id: string
          provider: string
          refresh_token: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string | null
          email?: string | null
          id?: string
          provider: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string | null
          email?: string | null
          id?: string
          provider?: string
          refresh_token?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      lead_rules: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          label: string | null
          pattern: string
          priority: number
          rule_type: Database["public"]["Enums"]["lead_rule_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          pattern: string
          priority?: number
          rule_type: Database["public"]["Enums"]["lead_rule_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          label?: string | null
          pattern?: string
          priority?: number
          rule_type?: Database["public"]["Enums"]["lead_rule_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          confidence: number
          created_at: string
          draft_id: string | null
          from_email: string
          from_name: string | null
          gmail_message_id: string | null
          id: string
          notes: string | null
          nudged_at: string | null
          received_at: string
          responded_at: string | null
          snippet: string | null
          source: string | null
          source_type: string
          status: Database["public"]["Enums"]["lead_status"]
          subject: string | null
          thread_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          draft_id?: string | null
          from_email: string
          from_name?: string | null
          gmail_message_id?: string | null
          id?: string
          notes?: string | null
          nudged_at?: string | null
          received_at?: string
          responded_at?: string | null
          snippet?: string | null
          source?: string | null
          source_type?: string
          status?: Database["public"]["Enums"]["lead_status"]
          subject?: string | null
          thread_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          draft_id?: string | null
          from_email?: string
          from_name?: string | null
          gmail_message_id?: string | null
          id?: string
          notes?: string | null
          nudged_at?: string | null
          received_at?: string
          responded_at?: string | null
          snippet?: string | null
          source?: string | null
          source_type?: string
          status?: Database["public"]["Enums"]["lead_status"]
          subject?: string | null
          thread_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      life_bills: {
        Row: {
          amount_cents: number | null
          autopay: boolean
          cadence: string | null
          created_at: string
          currency: string
          id: string
          name: string
          next_due: string | null
          notes: string | null
          source: string | null
          updated_at: string
          user_id: string
          vendor: string | null
        }
        Insert: {
          amount_cents?: number | null
          autopay?: boolean
          cadence?: string | null
          created_at?: string
          currency?: string
          id?: string
          name: string
          next_due?: string | null
          notes?: string | null
          source?: string | null
          updated_at?: string
          user_id: string
          vendor?: string | null
        }
        Update: {
          amount_cents?: number | null
          autopay?: boolean
          cadence?: string | null
          created_at?: string
          currency?: string
          id?: string
          name?: string
          next_due?: string | null
          notes?: string | null
          source?: string | null
          updated_at?: string
          user_id?: string
          vendor?: string | null
        }
        Relationships: []
      }
      life_rituals: {
        Row: {
          active: boolean
          cadence: string | null
          created_at: string
          id: string
          next_at: string | null
          notes: string | null
          source: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          cadence?: string | null
          created_at?: string
          id?: string
          next_at?: string | null
          notes?: string | null
          source?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          cadence?: string | null
          created_at?: string
          id?: string
          next_at?: string | null
          notes?: string | null
          source?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      life_suggestions: {
        Row: {
          confidence: number
          created_at: string
          id: string
          kind: string
          payload: Json
          source: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence?: number
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          source?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          source?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mvp_checklist_items: {
        Row: {
          category: string
          created_at: string
          id: string
          label: string
          notes: string | null
          sort_order: number
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          label: string
          notes?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          label?: string
          notes?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      nylas_grants: {
        Row: {
          created_at: string
          email: string | null
          grant_id: string | null
          id: string
          provider: string
          scopes: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          grant_id?: string | null
          id?: string
          provider: string
          scopes?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          grant_id?: string | null
          id?: string
          provider?: string
          scopes?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          referrer_name: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          referrer_name?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          referrer_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referral_reward_events: {
        Row: {
          code: string
          created_at: string
          cumulative_months: number
          id: string
          metadata: Json
          months_awarded: number
          referee_user_id: string | null
          referral_id: string | null
          referrer_user_id: string
          source: string
        }
        Insert: {
          code: string
          created_at?: string
          cumulative_months: number
          id?: string
          metadata?: Json
          months_awarded?: number
          referee_user_id?: string | null
          referral_id?: string | null
          referrer_user_id: string
          source?: string
        }
        Update: {
          code?: string
          created_at?: string
          cumulative_months?: number
          id?: string
          metadata?: Json
          months_awarded?: number
          referee_user_id?: string | null
          referral_id?: string | null
          referrer_user_id?: string
          source?: string
        }
        Relationships: []
      }
      referral_share_events: {
        Row: {
          channel: string
          code: string
          created_at: string
          id: string
          metadata: Json
          user_id: string
        }
        Insert: {
          channel: string
          code: string
          created_at?: string
          id?: string
          metadata?: Json
          user_id: string
        }
        Update: {
          channel?: string
          code?: string
          created_at?: string
          id?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          activated_at: string | null
          clicked_at: string | null
          code: string
          created_at: string
          id: string
          referee_email: string | null
          referee_user_id: string | null
          referrer_user_id: string
          rewarded_at: string | null
          signed_up_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          clicked_at?: string | null
          code: string
          created_at?: string
          id?: string
          referee_email?: string | null
          referee_user_id?: string | null
          referrer_user_id: string
          rewarded_at?: string | null
          signed_up_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          clicked_at?: string | null
          code?: string
          created_at?: string
          id?: string
          referee_email?: string | null
          referee_user_id?: string | null
          referrer_user_id?: string
          rewarded_at?: string | null
          signed_up_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      scheduled_emails: {
        Row: {
          bcc: string | null
          body: string
          cc: string | null
          created_at: string
          error: string | null
          gmail_message_id: string | null
          id: string
          scheduled_at: string
          sent_at: string | null
          status: string
          subject: string
          to_email: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bcc?: string | null
          body: string
          cc?: string | null
          created_at?: string
          error?: string | null
          gmail_message_id?: string | null
          id?: string
          scheduled_at: string
          sent_at?: string | null
          status?: string
          subject: string
          to_email: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bcc?: string | null
          body?: string
          cc?: string | null
          created_at?: string
          error?: string | null
          gmail_message_id?: string | null
          id?: string
          scheduled_at?: string
          sent_at?: string | null
          status?: string
          subject?: string
          to_email?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduling_preferences: {
        Row: {
          block_lunch: boolean
          buffer_minutes: number
          created_at: string
          id: string
          lunch_end: string
          lunch_start: string
          preferred_meeting_duration: number
          updated_at: string
          user_id: string
          working_hours_end: string
          working_hours_start: string
        }
        Insert: {
          block_lunch?: boolean
          buffer_minutes?: number
          created_at?: string
          id?: string
          lunch_end?: string
          lunch_start?: string
          preferred_meeting_duration?: number
          updated_at?: string
          user_id: string
          working_hours_end?: string
          working_hours_start?: string
        }
        Update: {
          block_lunch?: boolean
          buffer_minutes?: number
          created_at?: string
          id?: string
          lunch_end?: string
          lunch_start?: string
          preferred_meeting_duration?: number
          updated_at?: string
          user_id?: string
          working_hours_end?: string
          working_hours_start?: string
        }
        Relationships: []
      }
      sms_conversations: {
        Row: {
          created_at: string
          id: string
          messages: Json
          phone_number: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          phone_number: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          phone_number?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      steno_sessions: {
        Row: {
          archived_at: string | null
          attendees: string[]
          created_at: string
          id: string
          item_count: number
          key_points: string[]
          location: string | null
          session_date: string
          summary: string | null
          title: string
          topics: string[]
          transcript: string
          transcript_file_path: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          attendees?: string[]
          created_at?: string
          id?: string
          item_count?: number
          key_points?: string[]
          location?: string | null
          session_date?: string
          summary?: string | null
          title?: string
          topics?: string[]
          transcript: string
          transcript_file_path?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          attendees?: string[]
          created_at?: string
          id?: string
          item_count?: number
          key_points?: string[]
          location?: string | null
          session_date?: string
          summary?: string | null
          title?: string
          topics?: string[]
          transcript?: string
          transcript_file_path?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          agent_name: string
          assessment_status: string | null
          created_at: string
          dashboard_mode: string
          decision_style: string | null
          digest_mode: boolean
          email_length: string | null
          id: string
          lead_escalate_drafted_minutes: number
          lead_escalate_to_slack: boolean
          lead_escalate_to_sms: boolean
          lead_nudge_enabled: boolean
          lead_nudge_minutes: number
          onboarding_completed: boolean
          onboarding_step: number
          phone_number: string | null
          priority_visibility: string | null
          quiet_hours_enabled: boolean
          quiet_hours_end: string
          quiet_hours_start: string
          referral_credits_months: number
          referred_by_code: string | null
          slack_notification_channel_id: string | null
          slack_notification_channel_name: string | null
          stt_language: string | null
          tone: string | null
          travel_mode_active: boolean
          travel_mode_message: string | null
          travel_mode_until: string | null
          tts_elevenlabs_model_id: string | null
          tts_elevenlabs_voice_id: string | null
          tts_enabled: boolean | null
          tts_pitch: number | null
          tts_provider: string | null
          tts_rate: number | null
          tts_similarity: number | null
          tts_stability: number | null
          tts_voice_uri: string | null
          updated_at: string
          user_display_name: string | null
          user_id: string
          vip_override_quiet: boolean
          voice_conversation_enabled: boolean | null
          weekly_review_enabled: boolean
          weekly_review_last_sent_date: string | null
        }
        Insert: {
          agent_name?: string
          assessment_status?: string | null
          created_at?: string
          dashboard_mode?: string
          decision_style?: string | null
          digest_mode?: boolean
          email_length?: string | null
          id?: string
          lead_escalate_drafted_minutes?: number
          lead_escalate_to_slack?: boolean
          lead_escalate_to_sms?: boolean
          lead_nudge_enabled?: boolean
          lead_nudge_minutes?: number
          onboarding_completed?: boolean
          onboarding_step?: number
          phone_number?: string | null
          priority_visibility?: string | null
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          referral_credits_months?: number
          referred_by_code?: string | null
          slack_notification_channel_id?: string | null
          slack_notification_channel_name?: string | null
          stt_language?: string | null
          tone?: string | null
          travel_mode_active?: boolean
          travel_mode_message?: string | null
          travel_mode_until?: string | null
          tts_elevenlabs_model_id?: string | null
          tts_elevenlabs_voice_id?: string | null
          tts_enabled?: boolean | null
          tts_pitch?: number | null
          tts_provider?: string | null
          tts_rate?: number | null
          tts_similarity?: number | null
          tts_stability?: number | null
          tts_voice_uri?: string | null
          updated_at?: string
          user_display_name?: string | null
          user_id: string
          vip_override_quiet?: boolean
          voice_conversation_enabled?: boolean | null
          weekly_review_enabled?: boolean
          weekly_review_last_sent_date?: string | null
        }
        Update: {
          agent_name?: string
          assessment_status?: string | null
          created_at?: string
          dashboard_mode?: string
          decision_style?: string | null
          digest_mode?: boolean
          email_length?: string | null
          id?: string
          lead_escalate_drafted_minutes?: number
          lead_escalate_to_slack?: boolean
          lead_escalate_to_sms?: boolean
          lead_nudge_enabled?: boolean
          lead_nudge_minutes?: number
          onboarding_completed?: boolean
          onboarding_step?: number
          phone_number?: string | null
          priority_visibility?: string | null
          quiet_hours_enabled?: boolean
          quiet_hours_end?: string
          quiet_hours_start?: string
          referral_credits_months?: number
          referred_by_code?: string | null
          slack_notification_channel_id?: string | null
          slack_notification_channel_name?: string | null
          stt_language?: string | null
          tone?: string | null
          travel_mode_active?: boolean
          travel_mode_message?: string | null
          travel_mode_until?: string | null
          tts_elevenlabs_model_id?: string | null
          tts_elevenlabs_voice_id?: string | null
          tts_enabled?: boolean | null
          tts_pitch?: number | null
          tts_provider?: string | null
          tts_rate?: number | null
          tts_similarity?: number | null
          tts_stability?: number | null
          tts_voice_uri?: string | null
          updated_at?: string
          user_display_name?: string | null
          user_id?: string
          vip_override_quiet?: boolean
          voice_conversation_enabled?: boolean | null
          weekly_review_enabled?: boolean
          weekly_review_last_sent_date?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      google_oauth_token_metadata: {
        Row: {
          created_at: string | null
          email: string | null
          id: string | null
          provider: string | null
          token_expires_at: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string | null
          provider?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string | null
          provider?: string | null
          token_expires_at?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      beta_user_status:
        | "invited"
        | "signed_up"
        | "active"
        | "churned"
        | "declined"
      beta_user_tier: "vip" | "standard" | "waitlist"
      lead_rule_type: "sender_domain" | "subject_keyword" | "recipient_inbox"
      lead_status:
        | "new"
        | "drafted"
        | "responded"
        | "qualified"
        | "closed"
        | "archived"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "user"],
      beta_user_status: [
        "invited",
        "signed_up",
        "active",
        "churned",
        "declined",
      ],
      beta_user_tier: ["vip", "standard", "waitlist"],
      lead_rule_type: ["sender_domain", "subject_keyword", "recipient_inbox"],
      lead_status: [
        "new",
        "drafted",
        "responded",
        "qualified",
        "closed",
        "archived",
      ],
    },
  },
} as const
