/**
 * Gate visual reutilizable para bloquear acciones que requieren correo
 * verificado (reportes ciudadanos, reportes de desaparecidos).
 *
 * El caller decide DÓNDE ponerlo (típicamente dentro de un Modal, en
 * lugar del formulario normal) según el flag `user.emailVerified` de
 * AuthContext. El gate ofrece al usuario tres acciones directas:
 *   · Reenviar correo de verificación.
 *   · Comprobar si ya verificó (fuerza `refreshUser()`).
 *   · Cerrar.
 */

import { MaterialIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { resendEmailVerification } from "../src/services/firebaseAuth";

interface Props {
  /** Título de la pantalla sobre la que se aplica el gate
   *  (ej. "Reportar incidente") — se muestra como contexto. */
  title: string;
  /** Texto que explica la acción bloqueada (ej. "enviar reportes
   *  ciudadanos"). Se incrusta en el mensaje "Para {action}…". */
  action: string;
  /** Llamado cuando el usuario cierra el modal desde el gate. */
  onClose: () => void;
}

export default function EmailVerificationGate({ title, action, onClose }: Props) {
  const { user, refreshUser } = useAuth();
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await resendEmailVerification();
      Alert.alert(
        "Correo enviado",
        `Te reenviamos el correo a ${user?.email ?? "tu dirección"}. Revisa también la carpeta de spam.`,
      );
    } catch (e) {
      Alert.alert(
        "No se pudo reenviar",
        e instanceof Error ? e.message : "Inténtalo más tarde.",
      );
    } finally {
      setResending(false);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    try {
      await refreshUser();
      // Si ya quedó verificado, el padre (ReportModal / MissingPersonsModal)
      // se re-renderiza y muestra el formulario. Si no, seguimos aquí.
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.grabber} />
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={10}>
          <MaterialIcons name="close" size={24} color="#475569" />
        </TouchableOpacity>
      </View>

      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <MaterialIcons name="mark-email-unread" size={48} color="#c2410c" />
        </View>
        <Text style={styles.heroTitle}>Verifica tu correo</Text>
        <Text style={styles.heroBody}>
          Para {action} necesitas confirmar tu dirección de correo. Ya te
          enviamos un enlace a{" "}
          <Text style={{ fontWeight: "700" }}>
            {user?.email ?? "tu correo"}
          </Text>
          . Revisa la bandeja (incluyendo spam o promociones) y toca el
          enlace.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.primary, resending && { opacity: 0.6 }]}
        onPress={handleResend}
        disabled={resending}
      >
        <MaterialIcons name="send" size={18} color="#fff" />
        <Text style={styles.primaryText}>
          {resending ? "Enviando…" : "Reenviar correo de verificación"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.secondary, checking && { opacity: 0.6 }]}
        onPress={handleCheck}
        disabled={checking}
      >
        <MaterialIcons name="refresh" size={18} color="#0f766e" />
        <Text style={styles.secondaryText}>
          {checking ? "Comprobando…" : "Ya verifiqué · comprobar"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.ghost} onPress={onClose}>
        <Text style={styles.ghostText}>Cerrar</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  grabber: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#cbd5e1",
    alignSelf: "center",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },
  hero: {
    alignItems: "center",
    marginVertical: 18,
    paddingHorizontal: 8,
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 22,
    backgroundColor: "#ffedd5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
    textAlign: "center",
  },
  heroBody: {
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
    lineHeight: 20,
  },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0f766e",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 8,
  },
  primaryText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
    letterSpacing: 0.3,
  },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#ccfbf1",
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 10,
  },
  secondaryText: {
    color: "#0f766e",
    fontWeight: "700",
    fontSize: 14,
  },
  ghost: {
    alignItems: "center",
    paddingVertical: 12,
    marginTop: 6,
  },
  ghostText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "600",
  },
});
