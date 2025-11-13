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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string | null
          currency: string | null
          id: string
          name: string
          org_id: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          id?: string
          name: string
          org_id?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          id?: string
          name?: string
          org_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_manifests: {
        Row: {
          created_at: string | null
          id: string
          month: number
          org_id: string | null
          period_label: string | null
          sha256: string
          total_receipts: number
          total_size_bytes: number
          year: number
          zip_path: string
          zip_size_bytes: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          month: number
          org_id?: string | null
          period_label?: string | null
          sha256: string
          total_receipts: number
          total_size_bytes: number
          year: number
          zip_path: string
          zip_size_bytes: number
        }
        Update: {
          created_at?: string | null
          id?: string
          month?: number
          org_id?: string | null
          period_label?: string | null
          sha256?: string
          total_receipts?: number
          total_size_bytes?: number
          year?: number
          zip_path?: string
          zip_size_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "archive_manifests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          confidence: number | null
          created_at: string | null
          id: string
          match_type: string | null
          matched_amount: number
          method: string | null
          org_id: string | null
          receipt_id: string | null
          transaction_id: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          match_type?: string | null
          matched_amount: number
          method?: string | null
          org_id?: string | null
          receipt_id?: string | null
          transaction_id?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string | null
          id?: string
          match_type?: string | null
          matched_amount?: number
          method?: string | null
          org_id?: string | null
          receipt_id?: string | null
          transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          created_at: string | null
          email: string
          id: string
          invited_by: string | null
          org_id: string
          role: Database["public"]["Enums"]["user_role"]
          status: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      org_users: {
        Row: {
          created_at: string
          id: string
          org_id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          org_id: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          org_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_users_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      orgs: {
        Row: {
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      receipt_txn_links: {
        Row: {
          created_at: string
          created_by: string | null
          method: string
          receipt_id: string
          transaction_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          method?: string
          receipt_id: string
          transaction_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          method?: string
          receipt_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_txn_links_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_txn_links_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          account_id: string | null
          category: string | null
          created_at: string | null
          created_by: string | null
          entered_by: string | null
          id: string
          image_url: string | null
          notes: string | null
          org_id: string | null
          receipt_date: string | null
          reconciled: boolean
          size_bytes: number | null
          source: string | null
          subtotal: number | null
          tax: number
          total: number
          vendor: string | null
        }
        Insert: {
          account_id?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          entered_by?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          org_id?: string | null
          receipt_date?: string | null
          reconciled?: boolean
          size_bytes?: number | null
          source?: string | null
          subtotal?: number | null
          tax?: number
          total: number
          vendor?: string | null
        }
        Update: {
          account_id?: string | null
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          entered_by?: string | null
          id?: string
          image_url?: string | null
          notes?: string | null
          org_id?: string | null
          receipt_date?: string | null
          reconciled?: boolean
          size_bytes?: number | null
          source?: string | null
          subtotal?: number | null
          tax?: number
          total?: number
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      rules: {
        Row: {
          account_id: string | null
          default_category: string | null
          enabled: boolean | null
          id: string
          match_pattern: string
          org_id: string | null
          priority: number | null
          recurring_amount: number | null
          recurring_day_window: number | null
          vendor_normalized: string | null
        }
        Insert: {
          account_id?: string | null
          default_category?: string | null
          enabled?: boolean | null
          id?: string
          match_pattern: string
          org_id?: string | null
          priority?: number | null
          recurring_amount?: number | null
          recurring_day_window?: number | null
          vendor_normalized?: string | null
        }
        Update: {
          account_id?: string | null
          default_category?: string | null
          enabled?: boolean | null
          id?: string
          match_pattern?: string
          org_id?: string | null
          priority?: number | null
          recurring_amount?: number | null
          recurring_day_window?: number | null
          vendor_normalized?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rules_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          category: string | null
          created_at: string | null
          csv_row: number | null
          currency: string | null
          description: string
          direction: string
          external_id: string | null
          generic_descriptor: boolean | null
          id: string
          imported_from: string | null
          imported_via: string | null
          institution: string | null
          org_id: string | null
          post_date: string | null
          provider_raw: Json | null
          raw: Json | null
          source_account_name: string | null
          txn_date: string
          txn_hash: string | null
          vendor_clean: string | null
        }
        Insert: {
          account_id?: string | null
          amount: number
          category?: string | null
          created_at?: string | null
          csv_row?: number | null
          currency?: string | null
          description: string
          direction: string
          external_id?: string | null
          generic_descriptor?: boolean | null
          id?: string
          imported_from?: string | null
          imported_via?: string | null
          institution?: string | null
          org_id?: string | null
          post_date?: string | null
          provider_raw?: Json | null
          raw?: Json | null
          source_account_name?: string | null
          txn_date: string
          txn_hash?: string | null
          vendor_clean?: string | null
        }
        Update: {
          account_id?: string | null
          amount?: number
          category?: string | null
          created_at?: string | null
          csv_row?: number | null
          currency?: string | null
          description?: string
          direction?: string
          external_id?: string | null
          generic_descriptor?: boolean | null
          id?: string
          imported_from?: string | null
          imported_via?: string | null
          institution?: string | null
          org_id?: string | null
          post_date?: string | null
          provider_raw?: Json | null
          raw?: Json | null
          source_account_name?: string | null
          txn_date?: string
          txn_hash?: string | null
          vendor_clean?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_rules: {
        Row: {
          auto_match: boolean
          category: string | null
          created_at: string
          direction_filter: string | null
          id: string
          org_id: string
          source: string | null
          tax: number | null
          vendor_pattern: string
        }
        Insert: {
          auto_match?: boolean
          category?: string | null
          created_at?: string
          direction_filter?: string | null
          id?: string
          org_id: string
          source?: string | null
          tax?: number | null
          vendor_pattern: string
        }
        Update: {
          auto_match?: boolean
          category?: string | null
          created_at?: string
          direction_filter?: string | null
          id?: string
          org_id?: string
          source?: string | null
          tax?: number | null
          vendor_pattern?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "orgs"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_org: {
        Args: { _name: string }
        Returns: {
          created_at: string | null
          id: string
          name: string
        }
        SetofOptions: {
          from: "*"
          to: "orgs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_user_role_in_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_min_role: {
        Args: {
          _min_role: Database["public"]["Enums"]["user_role"]
          _org_id: string
          _user_id: string
        }
        Returns: boolean
      }
      user_in_org: {
        Args: { _org_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      user_role: "owner" | "admin" | "staff"
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
      user_role: ["owner", "admin", "staff"],
    },
  },
} as const
