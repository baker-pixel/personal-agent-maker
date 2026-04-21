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
          title?: string
          updated_at?: string
          user_id?: string
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
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
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
          tags: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
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
          tags?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
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
          user_id?: string
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
      user_preferences: {
        Row: {
          agent_name: string
          created_at: string
          id: string
          phone_number: string | null
          slack_notification_channel_id: string | null
          slack_notification_channel_name: string | null
          stt_language: string | null
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
          user_id: string
          voice_conversation_enabled: boolean | null
        }
        Insert: {
          agent_name?: string
          created_at?: string
          id?: string
          phone_number?: string | null
          slack_notification_channel_id?: string | null
          slack_notification_channel_name?: string | null
          stt_language?: string | null
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
          user_id: string
          voice_conversation_enabled?: boolean | null
        }
        Update: {
          agent_name?: string
          created_at?: string
          id?: string
          phone_number?: string | null
          slack_notification_channel_id?: string | null
          slack_notification_channel_name?: string | null
          stt_language?: string | null
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
          user_id?: string
          voice_conversation_enabled?: boolean | null
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
      [_ in never]: never
    }
    Enums: {
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
