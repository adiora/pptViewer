import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ConnectScreen extends StatefulWidget {
  const ConnectScreen({super.key});

  @override
  State<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends State<ConnectScreen> {
  final _codeController = TextEditingController();
  final _urlController = TextEditingController(text: 'https://slides.77128877.xyz');
  final _storage = const FlutterSecureStorage();

  bool _isLoading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _loadSavedServerUrl();
  }

  Future<void> _loadSavedServerUrl() async {
    try {
      final savedUrl = await _storage.read(key: 'server_url');
      if (savedUrl != null && savedUrl.isNotEmpty) {
        setState(() {
          _urlController.text = savedUrl;
        });
      }
    } catch (e) {
      debugPrint('Could not read stored URL: $e');
    }
  }

  Future<void> _connect() async {
    final code = _codeController.text.trim().toUpperCase();
    var serverUrl = _urlController.text.trim();

    if (code.length != 6) {
      setState(() => _errorMessage = 'Session code must be exactly 6 characters');
      return;
    }

    if (serverUrl.endsWith('/')) {
      serverUrl = serverUrl.substring(0, serverUrl.length - 1);
    }

    final parsedUri = Uri.tryParse(serverUrl);
    if (parsedUri == null || !parsedUri.hasAuthority) {
      setState(() => _errorMessage = 'Invalid server URL (e.g. https://slides.77128877.xyz)');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      // Validate session existence via REST API
      final apiUrl = Uri.parse('$serverUrl/api/session/$code');
      debugPrint('Validating session at: $apiUrl');

      final response = await http.get(apiUrl).timeout(const Duration(seconds: 5));

      if (response.statusCode == 404) {
        setState(() {
          _errorMessage = 'Session code not found or expired (24h TTL)';
          _isLoading = false;
        });
        return;
      }

      if (response.statusCode != 200) {
        setState(() {
          _errorMessage = 'Server error (${response.statusCode})';
          _isLoading = false;
        });
        return;
      }

      final sessionData = jsonDecode(response.body);

      // Save valid server URL for future quick connection
      await _storage.write(key: 'server_url', value: serverUrl);

      if (!mounted) return;

      setState(() => _isLoading = false);

      // Navigate to Remote Screen
      Navigator.pushNamed(context, '/remote', arguments: {
        'code': code,
        'serverUrl': serverUrl,
        'slideCount': sessionData['slideCount'] ?? 1,
      });

    } catch (e) {
      debugPrint('Connection error: $e');
      setState(() {
        _errorMessage = 'Cannot reach server. Check Wi-Fi / IP address.';
        _isLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // App Brand Logo / Icon
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.15),
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.4),
                      ),
                    ),
                    child: Icon(
                      Icons.settings_remote_rounded,
                      size: 36,
                      color: Theme.of(context).colorScheme.primary,
                    ),
                  ),
                  const SizedBox(height: 16),

                  const Text(
                    'PPT Remote',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      letterSpacing: -0.5,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Control presentations with phone volume keys',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 14,
                      color: Colors.white.withValues(alpha: 0.6),
                    ),
                  ),
                  const SizedBox(height: 32),

                  // Form Card
                  Card(
                    elevation: 4,
                    child: Padding(
                      padding: const EdgeInsets.all(20.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          // Server URL Input
                          const Text(
                            'SERVER HOST URL',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Colors.white60,
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _urlController,
                            keyboardType: TextInputType.url,
                            decoration: InputDecoration(
                              prefixIcon: const Icon(Icons.dns_rounded, size: 20),
                              hintText: 'https://slides.77128877.xyz',
                              filled: true,
                              fillColor: Colors.black26,
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide.none,
                              ),
                              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                            ),
                          ),
                          const SizedBox(height: 20),

                          // Session Code Input
                          const Text(
                            '6-CHARACTER SESSION CODE',
                            style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: Colors.white60,
                            ),
                          ),
                          const SizedBox(height: 8),
                          TextField(
                            controller: _codeController,
                            textCapitalization: TextCapitalization.characters,
                            maxLength: 6,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontFamily: 'monospace',
                              fontSize: 26,
                              fontWeight: FontWeight.bold,
                              letterSpacing: 8,
                            ),
                            inputFormatters: [
                              FilteringTextInputFormatter.allow(RegExp(r'[A-HJ-NP-Z2-9a-hj-np-z2-9]')),
                            ],
                            decoration: InputDecoration(
                              counterText: '',
                              hintText: '••••••',
                              filled: true,
                              fillColor: Colors.black26,
                              border: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide.none,
                              ),
                              contentPadding: const EdgeInsets.symmetric(vertical: 16),
                            ),
                          ),
                          const SizedBox(height: 24),

                          // Error Alert
                          if (_errorMessage != null) ...[
                            Container(
                              padding: const EdgeInsets.all(12),
                              decoration: BoxDecoration(
                                color: Theme.of(context).colorScheme.error.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(
                                  color: Theme.of(context).colorScheme.error.withValues(alpha: 0.4),
                                ),
                              ),
                              child: Row(
                                children: [
                                  Icon(
                                    Icons.error_outline,
                                    color: Theme.of(context).colorScheme.error,
                                    size: 20,
                                  ),
                                  const SizedBox(width: 10),
                                  Expanded(
                                    child: Text(
                                      _errorMessage!,
                                      style: TextStyle(
                                        color: Theme.of(context).colorScheme.error,
                                        fontSize: 13,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(height: 16),
                          ],

                          // Connect Button
                          ElevatedButton(
                            onPressed: _isLoading ? null : _connect,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: Theme.of(context).colorScheme.primary,
                              foregroundColor: Colors.white,
                              padding: const EdgeInsets.symmetric(vertical: 16),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                            ),
                            child: _isLoading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white,
                                    ),
                                  )
                                : const Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(Icons.link_rounded),
                                      SizedBox(width: 8),
                                      Text(
                                        'Connect to Session',
                                        style: TextStyle(
                                          fontSize: 16,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ],
                                  ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),

                  // How To Use Guide Card
                  Card(
                    color: Colors.white.withValues(alpha: 0.03),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(16.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(
                                Icons.info_outline_rounded,
                                size: 18,
                                color: Theme.of(context).colorScheme.primary,
                              ),
                              const SizedBox(width: 8),
                              const Text(
                                'How to Remote Control',
                                style: TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 14,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          _buildGuideStep('1', 'Upload .pptx file on presenter browser'),
                          _buildGuideStep('2', 'Enter 6-character code shown on screen'),
                          _buildGuideStep('3', 'Press Vol+ for Next slide, Vol- for Prev'),
                          _buildGuideStep('4', 'Press both volume keys to toggle video'),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildGuideStep(String number, String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 18,
            height: 18,
            decoration: BoxDecoration(
              color: Colors.white10,
              borderRadius: BorderRadius.circular(9),
            ),
            alignment: Alignment.center,
            child: Text(
              number,
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.bold),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: const TextStyle(fontSize: 13, color: Colors.white70),
            ),
          ),
        ],
      ),
    );
  }
}
