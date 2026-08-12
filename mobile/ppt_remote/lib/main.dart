import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'screens/connect_screen.dart';
import 'screens/remote_screen.dart';
import 'services/volume_button_service.dart';
import 'services/websocket_service.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PPTRemoteApp());
}

class PPTRemoteApp extends StatelessWidget {
  const PPTRemoteApp({super.key});

  @override
  Widget build(BuildContext context) {
    // Dark Space Theme (matching web frontend styling)
    final darkTheme = ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: const Color(0xFF090A0F),
      colorScheme: const ColorScheme.dark(
        primary: Color(0xFF6366F1), // Indigo accent
        secondary: Color(0xFF8B5CF6),
        surface: Color(0xFF161926),
        error: Color(0xFFEF4444),
      ),
      fontFamily: 'Inter',
      cardTheme: CardThemeData(
        color: const Color(0xFF161926),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Colors.white10),
        ),
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Color(0xFF090A0F),
        elevation: 0,
        centerTitle: true,
      ),
    );

    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => WebSocketService()),
        Provider(create: (_) => VolumeButtonService()),
      ],
      child: MaterialApp(
        title: 'PPT Remote',
        debugShowCheckedModeBanner: false,
        theme: darkTheme,
        initialRoute: '/connect',
        routes: {
          '/connect': (context) => const ConnectScreen(),
          '/remote': (context) => const RemoteScreen(),
        },
      ),
    );
  }
}
